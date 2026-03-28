export class MetricsService {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
  }

  increment(name, amount = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  setGauge(name, value) {
    this.gauges.set(name, value);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries()),
      timestamp: new Date().toISOString(),
    };
  }
}
