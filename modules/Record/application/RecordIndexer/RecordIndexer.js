import { Record } from "../../domain/entity/Record/index.js";

export class RecordIndexer {
  constructor(store) {
    this.store = store;
  }

  async handleOperation(batch, operation) {
    if (operation.type === Record.ACTIONS.CREATE) {
      await this.indexRecords(batch, operation);
    }
  }

  async indexRecords(batch, operation) {
    const { record: recordData } = operation;

    const record = new Record(recordData);

    // Check if the record already exists
    // get() is proxied to the underlying autobee
    const result = await this.store.get(record.key);

    if (result) {
      console.log("That record already exists! Not storing...");
      return;
    }

    await batch.put(record.key, {
      record: record.toProperties(),
    });
  }
}
