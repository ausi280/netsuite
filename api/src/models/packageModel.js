const db = require('../../database');

class PackageModel {
  constructor(db) {
    this.db = db;
  }

  get tableName() {
    return 'netsuite_records';
  }

  getAll() {
    return this.db(this.tableName).select('*');
  }

  getById(id) {
    return this.db(this.tableName).where({ id }).first();
  }

  create(data) {
    return this.db(this.tableName).insert(data).returning('*');
  }

  update(id, data) {
    return this.db(this.tableName).where({ id }).update(data).returning('*');
  }

  delete(id) {
    return this.db(this.tableName).where({ id }).del();
  }
}

module.exports = new PackageModel(db);
