import { Record } from "../../domain/entity/Record/index.js";

export class RecordUseCase {
  constructor(store) {
    this.store = store;
  }

  async addRecord(record) {
    await this.store.appendOperation(
      JSON.stringify({
        type: Record.ACTIONS.CREATE,
        record: record.toProperties(),
      })
    );

    return true;
  }
}
