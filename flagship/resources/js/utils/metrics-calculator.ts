/**
 * Calculate CPU usage percentage from raw Prometheus counter values
 *
 * @param dataPoints - Array of raw CPU metrics (sorted by timestamp DESC)
 * @returns Array with calculated cpu_usage_percent
 */
export interface RawCpuMetric {
  timestamp: string;
  cpu_idle_seconds: number;
  cpu_user_seconds: number;
  cpu_system_seconds: number;
  cpu_iowait_seconds: number;
  cpu_steal_seconds: number;
  cpu_cores: number;
}

export interface CalculatedCpuMetric {
  timestamp: string;
  cpu_usage_percent: number | null;
  // Keep raw values for debugging
  raw?: RawCpuMetric;
}

/**
 * Calculate CPU usage from raw counter data
 *
 * How it works:
 * 1. For each data point, compare with previous point
 * 2. Calculate delta (change) in each counter
 * 3. Active time = user + system + iowait + steal deltas
 * 4. CPU % = (active_time / cpu_cores) / time_delta * 100
 */
export function calculateCpuUsage(
  rawDataPoints: RawCpuMetric[],
  includeRaw = false
): CalculatedCpuMetric[] {
  // Data comes sorted DESC, reverse it to process chronologically
  const sorted = [...rawDataPoints].reverse();
  const result: CalculatedCpuMetric[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = i > 0 ? sorted[i - 1] : null;

    if (!previous) {
      // First data point - no previous to calculate delta
      result.push({
        timestamp: current.timestamp,
        cpu_usage_percent: null,
        ...(includeRaw && { raw: current }),
      });
      continue;
    }

    // Calculate time delta in seconds
    const currentTime = new Date(current.timestamp).getTime();
    const previousTime = new Date(previous.timestamp).getTime();
    const timeDelta = (currentTime - previousTime) / 1000;

    if (timeDelta <= 0) {
      // Invalid time delta
      result.push({
        timestamp: current.timestamp,
        cpu_usage_percent: null,
        ...(includeRaw && { raw: current }),
      });
      continue;
    }

    // Calculate counter deltas
    const userDelta = current.cpu_user_seconds - previous.cpu_user_seconds;
    const systemDelta = current.cpu_system_seconds - previous.cpu_system_seconds;
    const iowaitDelta = current.cpu_iowait_seconds - previous.cpu_iowait_seconds;
    const stealDelta = current.cpu_steal_seconds - previous.cpu_steal_seconds;

    // Check for counter resets (negative deltas)
    if (userDelta < 0 || systemDelta < 0 || iowaitDelta < 0 || stealDelta < 0) {
      // Counter reset detected (server reboot or counter overflow)
      result.push({
        timestamp: current.timestamp,
        cpu_usage_percent: null,
        ...(includeRaw && { raw: current }),
      });
      continue;
    }

    // Calculate active time (all non-idle time)
    const activeTimeDelta = userDelta + systemDelta + iowaitDelta + stealDelta;

    // Calculate CPU usage percentage
    // Formula: (active_time / cpu_cores) / time_delta * 100
    const cpuUsagePercent = (activeTimeDelta / current.cpu_cores / timeDelta) * 100;

    // Clamp between 0 and 100
    const clampedPercent = Math.max(0, Math.min(100, cpuUsagePercent));

    result.push({
      timestamp: current.timestamp,
      cpu_usage_percent: Math.round(clampedPercent * 100) / 100, // Round to 2 decimals
      ...(includeRaw && { raw: current }),
    });
  }

  // Reverse back to DESC order to match API response
  return result.reverse();
}

/**
 * Debug helper - shows the calculation for a single data point
 */
export function debugCpuCalculation(current: RawCpuMetric, previous: RawCpuMetric) {
  const currentTime = new Date(current.timestamp).getTime();
  const previousTime = new Date(previous.timestamp).getTime();
  const timeDelta = (currentTime - previousTime) / 1000;

  const userDelta = current.cpu_user_seconds - previous.cpu_user_seconds;
  const systemDelta = current.cpu_system_seconds - previous.cpu_system_seconds;
  const iowaitDelta = current.cpu_iowait_seconds - previous.cpu_iowait_seconds;
  const stealDelta = current.cpu_steal_seconds - previous.cpu_steal_seconds;
  const activeTimeDelta = userDelta + systemDelta + iowaitDelta + stealDelta;

  const cpuPercent = (activeTimeDelta / current.cpu_cores / timeDelta) * 100;

  console.log('CPU Calculation Debug:', {
    timestamp: current.timestamp,
    timeDelta: `${timeDelta}s`,
    cores: current.cpu_cores,
    deltas: {
      user: userDelta.toFixed(4),
      system: systemDelta.toFixed(4),
      iowait: iowaitDelta.toFixed(4),
      steal: stealDelta.toFixed(4),
      total_active: activeTimeDelta.toFixed(4),
    },
    calculation: `(${activeTimeDelta.toFixed(4)} / ${current.cpu_cores}) / ${timeDelta} * 100`,
    result: `${cpuPercent.toFixed(2)}%`,
  });

  return cpuPercent;
}

// ============================================================================
// NETWORK METRICS
// ============================================================================

export interface RawNetworkMetric {
  timestamp: string;
  network_receive_bytes_total: number;
  network_transmit_bytes_total: number;
  network_receive_packets_total: number;
  network_transmit_packets_total: number;
  network_receive_errs_total: number;
  network_transmit_errs_total: number;
  network_receive_drop_total: number;
  network_transmit_drop_total: number;
}

export interface CalculatedNetworkMetric {
  timestamp: string;
  // Throughput in Mbps (megabits per second)
  network_download_mbps: number | null;
  network_upload_mbps: number | null;
  // Packet rates (packets per second)
  network_rx_packets_per_sec: number | null;
  network_tx_packets_per_sec: number | null;
  // Error rates (errors per second)
  network_rx_errors_per_sec: number | null;
  network_tx_errors_per_sec: number | null;
  // Drop rates (drops per second)
  network_rx_drops_per_sec: number | null;
  network_tx_drops_per_sec: number | null;
  // Keep raw values for debugging
  raw?: RawNetworkMetric;
}

/**
 * Calculate network throughput from raw counter data
 *
 * How it works:
 * 1. For each data point, compare with previous point
 * 2. Calculate delta (change) in each counter
 * 3. Divide by time delta to get rate per second
 * 4. Convert bytes/sec to Mbps (megabits per second)
 *
 * Formula: bytes_delta / time_delta / 1024 / 1024 * 8 = Mbps
 */
export function calculateNetworkThroughput(
  rawDataPoints: RawNetworkMetric[],
  includeRaw = false
): CalculatedNetworkMetric[] {
  // Data comes sorted DESC, reverse it to process chronologically
  const sorted = [...rawDataPoints].reverse();
  const result: CalculatedNetworkMetric[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = i > 0 ? sorted[i - 1] : null;

    if (!previous) {
      // First data point - no previous to calculate delta
      result.push({
        timestamp: current.timestamp,
        network_download_mbps: null,
        network_upload_mbps: null,
        network_rx_packets_per_sec: null,
        network_tx_packets_per_sec: null,
        network_rx_errors_per_sec: null,
        network_tx_errors_per_sec: null,
        network_rx_drops_per_sec: null,
        network_tx_drops_per_sec: null,
        ...(includeRaw && { raw: current }),
      });
      continue;
    }

    // Calculate time delta in seconds
    const currentTime = new Date(current.timestamp).getTime();
    const previousTime = new Date(previous.timestamp).getTime();
    const timeDelta = (currentTime - previousTime) / 1000;

    if (timeDelta <= 0) {
      // Invalid time delta
      result.push({
        timestamp: current.timestamp,
        network_download_mbps: null,
        network_upload_mbps: null,
        network_rx_packets_per_sec: null,
        network_tx_packets_per_sec: null,
        network_rx_errors_per_sec: null,
        network_tx_errors_per_sec: null,
        network_rx_drops_per_sec: null,
        network_tx_drops_per_sec: null,
        ...(includeRaw && { raw: current }),
      });
      continue;
    }

    // Calculate counter deltas
    const rxBytesDelta = current.network_receive_bytes_total - previous.network_receive_bytes_total;
    const txBytesDelta = current.network_transmit_bytes_total - previous.network_transmit_bytes_total;
    const rxPacketsDelta = current.network_receive_packets_total - previous.network_receive_packets_total;
    const txPacketsDelta = current.network_transmit_packets_total - previous.network_transmit_packets_total;
    const rxErrsDelta = current.network_receive_errs_total - previous.network_receive_errs_total;
    const txErrsDelta = current.network_transmit_errs_total - previous.network_transmit_errs_total;
    const rxDropsDelta = current.network_receive_drop_total - previous.network_receive_drop_total;
    const txDropsDelta = current.network_transmit_drop_total - previous.network_transmit_drop_total;

    // Check for counter resets (negative deltas)
    if (
      rxBytesDelta < 0 ||
      txBytesDelta < 0 ||
      rxPacketsDelta < 0 ||
      txPacketsDelta < 0 ||
      rxErrsDelta < 0 ||
      txErrsDelta < 0 ||
      rxDropsDelta < 0 ||
      txDropsDelta < 0
    ) {
      // Counter reset detected (server reboot or interface reset)
      result.push({
        timestamp: current.timestamp,
        network_download_mbps: null,
        network_upload_mbps: null,
        network_rx_packets_per_sec: null,
        network_tx_packets_per_sec: null,
        network_rx_errors_per_sec: null,
        network_tx_errors_per_sec: null,
        network_rx_drops_per_sec: null,
        network_tx_drops_per_sec: null,
        ...(includeRaw && { raw: current }),
      });
      continue;
    }

    // Calculate rates per second
    const rxBytesPerSec = rxBytesDelta / timeDelta;
    const txBytesPerSec = txBytesDelta / timeDelta;
    const rxPacketsPerSec = rxPacketsDelta / timeDelta;
    const txPacketsPerSec = txPacketsDelta / timeDelta;
    const rxErrsPerSec = rxErrsDelta / timeDelta;
    const txErrsPerSec = txErrsDelta / timeDelta;
    const rxDropsPerSec = rxDropsDelta / timeDelta;
    const txDropsPerSec = txDropsDelta / timeDelta;

    // Convert bytes/sec to Mbps (megabits per second)
    // Formula: (bytes/sec) / 1024 / 1024 * 8 = Mbps
    const downloadMbps = (rxBytesPerSec * 8) / 1024 / 1024;
    const uploadMbps = (txBytesPerSec * 8) / 1024 / 1024;

    result.push({
      timestamp: current.timestamp,
      network_download_mbps: Math.round(downloadMbps * 100) / 100, // 2 decimals
      network_upload_mbps: Math.round(uploadMbps * 100) / 100,
      network_rx_packets_per_sec: Math.round(rxPacketsPerSec * 100) / 100,
      network_tx_packets_per_sec: Math.round(txPacketsPerSec * 100) / 100,
      network_rx_errors_per_sec: Math.round(rxErrsPerSec * 100) / 100,
      network_tx_errors_per_sec: Math.round(txErrsPerSec * 100) / 100,
      network_rx_drops_per_sec: Math.round(rxDropsPerSec * 100) / 100,
      network_tx_drops_per_sec: Math.round(txDropsPerSec * 100) / 100,
      ...(includeRaw && { raw: current }),
    });
  }

  // Reverse back to DESC order to match API response
  return result.reverse();
}

/**
 * Debug helper - shows network calculation for a single data point
 */
export function debugNetworkCalculation(current: RawNetworkMetric, previous: RawNetworkMetric) {
  const currentTime = new Date(current.timestamp).getTime();
  const previousTime = new Date(previous.timestamp).getTime();
  const timeDelta = (currentTime - previousTime) / 1000;

  const rxBytesDelta = current.network_receive_bytes_total - previous.network_receive_bytes_total;
  const txBytesDelta = current.network_transmit_bytes_total - previous.network_transmit_bytes_total;

  const rxBytesPerSec = rxBytesDelta / timeDelta;
  const txBytesPerSec = txBytesDelta / timeDelta;

  const downloadMbps = (rxBytesPerSec * 8) / 1024 / 1024;
  const uploadMbps = (txBytesPerSec * 8) / 1024 / 1024;

  console.log('Network Calculation Debug:', {
    timestamp: current.timestamp,
    timeDelta: `${timeDelta}s`,
    deltas: {
      rx_bytes: rxBytesDelta.toLocaleString(),
      tx_bytes: txBytesDelta.toLocaleString(),
    },
    rates_per_sec: {
      rx_bytes: rxBytesPerSec.toFixed(2),
      tx_bytes: txBytesPerSec.toFixed(2),
    },
    calculation: `(${rxBytesDelta} / ${timeDelta}) * 8 / 1024 / 1024`,
    result: {
      download_mbps: downloadMbps.toFixed(2),
      upload_mbps: uploadMbps.toFixed(2),
    },
  });

  return { downloadMbps, uploadMbps };
}
