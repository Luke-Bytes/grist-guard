export class RetentionService {
  constructor({ config, store }) {
    this.config = config;
    this.store = store;
  }

  prune({ dryRun = false, retentionDays = this.config.policy.retentionDays } = {}) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    return this.store.pruneOldRecords(cutoff, dryRun);
  }
}
