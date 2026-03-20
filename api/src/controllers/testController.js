const env = require('../../config').env;
const db = require('../../database');

class TestController {

  constructor() {
    this.service = env.SERVICES.TEST;
  }

  //Endpoints
 
  getDB = async (req, res, options = {}) => {
    
    try {

        const rows = await db.raw('SELECT 1 AS test');
        res.json(rows);

    } catch (error) {

        res.status(500).json({ error: error.message });

    }

  }

}

module.exports = new TestController();



