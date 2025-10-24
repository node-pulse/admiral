import { WebSocketServer, WebSocket } from "ws";
import { Client } from "ssh2";
import pg from "pg";
import crypto from "crypto";
import dotenv from "dotenv";

const { Pool } = pg;
dotenv.config();

// Load master key for decryption
const MASTER_KEY = process.env.SSH_MASTER_KEY;

// Decrypt function (compatible with Laravel's encryption)
function decrypt(encryptedData) {
  try {
    if (!encryptedData) {
      return null;
    }

    // Parse the Laravel encrypted payload
    // Laravel format: JSON payload containing 'iv', 'value', and 'mac'
    const payload = JSON.parse(
      Buffer.from(encryptedData, "base64").toString("utf8")
    );

    // The master key should be exactly 32 bytes for AES-256
    // If it's a hex string, we keep only first 32 chars (16 bytes hex = 32 chars)
    // If shorter, pad to 32 bytes
    let key = MASTER_KEY;
    if (key.length < 32) {
      key = key.padEnd(32, "0");
    } else if (key.length > 32) {
      key = key.substring(0, 32);
    }

    // Convert key to Buffer
    const keyBuffer = Buffer.from(key, "utf8");

    // Create decipher
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      keyBuffer,
      Buffer.from(payload.iv, "base64")
    );
    decipher.setAutoPadding(true);

    // Decrypt
    let decrypted = decipher.update(payload.value, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);

    // Try alternative: sometimes data might not be encrypted
    if (!encryptedData.includes("{") && !encryptedData.includes("=")) {
      // Might be plain text
      return encryptedData;
    }

    return null;
  }
}

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_DATABASE || "node_pulse_admiral",
  user: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// WebSocket server
const wss = new WebSocketServer({
  port: process.env.WS_PORT || 6001,
  perMessageDeflate: false,
});

console.log(
  `SSH WebSocket server running on port ${process.env.WS_PORT || 6001}`
);

// Store active connections
const connections = new Map();

wss.on("connection", async (ws, req) => {
  const url = req.url;
  console.log(
    `[WS] New connection from ${req.socket.remoteAddress}, URL: ${url}`
  );

  // Extract server ID from URL
  const match = url.match(/\/ssh\/([a-f0-9\-]+)/);
  if (!match) {
    console.error("[WS] Invalid URL format");
    ws.send(JSON.stringify({ type: "error", message: "Invalid URL format" }));
    ws.close();
    return;
  }

  const serverId = match[1];
  const sessionId = `ssh_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  // Store connection info
  const connInfo = {
    serverId,
    sessionId,
    ssh: null,
    stream: null,
  };

  connections.set(sessionId, connInfo);

  // Send initial connection message
  ws.send(
    JSON.stringify({
      type: "connected",
      sessionId: sessionId,
      message: "WebSocket connected. Send auth message to begin SSH session.",
    })
  );

  // Handle incoming messages
  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "auth":
          await handleAuth(ws, connInfo, message);
          break;

        case "input":
          handleInput(connInfo, message);
          break;

        case "resize":
          handleResize(connInfo, message);
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        default:
          console.log(`[${sessionId}] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[${sessionId}] Error handling message:`, error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Error: ${error.message}`,
        })
      );
    }
  });

  // Handle connection close
  ws.on("close", () => {
    console.log(`[${sessionId}] WebSocket connection closed`);
    cleanup(connInfo);
  });

  ws.on("error", (error) => {
    console.error(`[${sessionId}] WebSocket error:`, error);
    cleanup(connInfo);
  });
});

async function handleAuth(ws, connInfo, message) {
  const { sessionId, serverId } = connInfo;

  console.log(`[${sessionId}] Auth message received:`, JSON.stringify(message));
  console.log(
    `[${sessionId}] ServerId: ${serverId}, Has host: ${!!message.host}`
  );

  try {
    let sshConfig = {};

    // Always fetch from database when we have a serverId
    if (serverId) {
      console.log(
        `[${sessionId}] Fetching server details from database for ${serverId}`
      );

      const query = `
        SELECT
          s.ssh_host,
          s.ssh_port,
          s.ssh_username,
          pk.private_key_content
        FROM admiral.servers s
        LEFT JOIN admiral.server_private_keys spk ON s.id = spk.server_id AND spk.is_primary = true
        LEFT JOIN admiral.private_keys pk ON spk.private_key_id = pk.id
        WHERE s.id = $1
      `;

      const result = await pool.query(query, [serverId]);

      if (result.rows.length === 0) {
        throw new Error("Server not found");
      }

      const server = result.rows[0];

      if (!server.ssh_host) {
        throw new Error("SSH host not configured for this server");
      }

      // Decrypt private key if it exists
      let privateKey = null;
      if (server.private_key_content) {
        console.log(
          `[${sessionId}] Encrypted key data (first 100 chars):`,
          server.private_key_content.substring(0, 100)
        );
        privateKey = decrypt(server.private_key_content);
        if (privateKey && privateKey !== server.private_key_content) {
          console.log(`[${sessionId}] Private key decrypted successfully`);
        } else {
          console.log(
            `[${sessionId}] Failed to decrypt private key, using raw value`
          );
          privateKey = server.private_key_content;
        }
      }

      sshConfig = {
        host: server.ssh_host,
        port: server.ssh_port || 22,
        username: server.ssh_username,
        privateKey: privateKey,
        password: message.password,
      };
    } else {
      // No serverId, must have credentials in message
      if (!message.host || !message.username) {
        throw new Error(
          "Server ID or SSH credentials (host, username) required"
        );
      }

      sshConfig = {
        host: message.host,
        port: message.port || 22,
        username: message.username,
        privateKey: message.privateKey,
        password: message.password,
      };
    }

    console.log(
      `[${sessionId}] Connecting to ${sshConfig.username}@${sshConfig.host}:${sshConfig.port}`
    );

    // Create SSH connection
    const ssh = new Client();
    connInfo.ssh = ssh;

    ssh.on("ready", () => {
      console.log(`[${sessionId}] SSH connection ready`);

      // Request a shell
      ssh.shell(
        {
          term: "xterm-256color",
          cols: message.cols || 80,
          rows: message.rows || 24,
        },
        (err, stream) => {
          if (err) {
            console.error(`[${sessionId}] Shell error:`, err);
            ws.send(
              JSON.stringify({
                type: "error",
                message: `Shell error: ${err.message}`,
              })
            );
            ssh.end();
            return;
          }

          console.log(`[${sessionId}] Shell stream established`);
          connInfo.stream = stream;

          // Send success message
          ws.send(
            JSON.stringify({
              type: "auth_success",
              message: "SSH connection established",
            })
          );

          // Handle SSH stream data
          stream.on("data", (data) => {
            // console.log(`[${sessionId}] SSH output: ${data.length} bytes`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: "output",
                  data: data.toString("utf8"),
                })
              );
            }
          });

          stream.on("close", () => {
            console.log(`[${sessionId}] SSH stream closed`);
            ws.send(
              JSON.stringify({
                type: "disconnected",
                message: "SSH connection closed",
              })
            );
            ws.close();
          });

          stream.on("error", (err) => {
            console.error(`[${sessionId}] Stream error:`, err);
            ws.send(
              JSON.stringify({
                type: "error",
                message: `Stream error: ${err.message}`,
              })
            );
          });
        }
      );
    });

    ssh.on("error", (err) => {
      console.error(`[${sessionId}] SSH error:`, err);
      ws.send(
        JSON.stringify({
          type: "error",
          message: `SSH error: ${err.message}`,
        })
      );
    });

    ssh.on("close", () => {
      console.log(`[${sessionId}] SSH connection closed`);
    });

    // Connect with appropriate authentication
    const connectionConfig = {
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.username,
      readyTimeout: 10000,
      keepaliveInterval: 5000,
    };

    // Try private key if provided
    if (sshConfig.privateKey) {
      console.log(`[${sessionId}] Using SSH key authentication`);
      connectionConfig.privateKey = sshConfig.privateKey;
    } else if (sshConfig.password) {
      console.log(`[${sessionId}] Using password authentication`);
      connectionConfig.password = sshConfig.password;
    } else {
      throw new Error(
        "No authentication method provided (need privateKey or password)"
      );
    }

    ssh.connect(connectionConfig);
  } catch (error) {
    console.error(`[${sessionId}] Auth error:`, error);
    ws.send(
      JSON.stringify({
        type: "error",
        message: `Authentication failed: ${error.message}`,
      })
    );
  }
}

function handleInput(connInfo, message) {
  const { sessionId, stream } = connInfo;

  if (!stream) {
    console.warn(`[${sessionId}] No stream available for input`);
    return;
  }

  const input = message.data || "";

  try {
    stream.write(input);
  } catch (error) {
    console.error(`[${sessionId}] Error writing to stream:`, error);
  }
}

function handleResize(connInfo, message) {
  const { sessionId, stream } = connInfo;

  if (!stream) {
    console.warn(`[${sessionId}] No stream available for resize`);
    return;
  }

  const cols = message.cols || 80;
  const rows = message.rows || 24;

  console.log(`[${sessionId}] Resizing to ${cols}x${rows}`);

  try {
    stream.setWindow(rows, cols);
  } catch (error) {
    console.error(`[${sessionId}] Error resizing:`, error);
  }
}

function cleanup(connInfo) {
  const { sessionId, ssh, stream } = connInfo;

  console.log(`[${sessionId}] Cleaning up connection`);

  if (stream) {
    try {
      stream.end();
    } catch (e) {
      // Ignore
    }
  }

  if (ssh) {
    try {
      ssh.end();
    } catch (e) {
      // Ignore
    }
  }

  connections.delete(sessionId);
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing connections...");

  connections.forEach((conn) => cleanup(conn));

  wss.close(() => {
    console.log("WebSocket server closed");
    pool.end(() => {
      console.log("Database pool closed");
      process.exit(0);
    });
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, closing connections...");

  connections.forEach((conn) => cleanup(conn));

  wss.close(() => {
    console.log("WebSocket server closed");
    pool.end(() => {
      console.log("Database pool closed");
      process.exit(0);
    });
  });
});

console.log("SSH WebSocket server is ready");
