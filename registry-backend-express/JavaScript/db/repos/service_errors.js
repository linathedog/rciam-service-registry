

let cs = {}; // Reusable ColumnSet objects.

/*
 This repository mixes hard-coded and dynamic SQL, primarily to show a diverse example of using both.
 */

class ServiceErrorsRepository {
    constructor(db, pgp) {
        this.db = db;
        this.pgp = pgp;
        const table = new pgp.helpers.TableName({table: 'service_errors', schema: 'public'});
        // set-up all ColumnSet objects, if needed:
        cs.insert = new pgp.helpers.ColumnSet(['error_description','error_code','service_id','date'],{table});


    }

    async add(errors){
      const query = this.pgp.helpers.insert(errors,cs.insert);
      let stuff = await this.db.any(query);
      console.log(stuff);
      return true
    }

    async getById(id){
      return this.db.any('SELECT * FROM service_errors WHERE service_id=$1',+id);
    }





}

//////////////////////////////////////////////////////////
// Example of statically initializing ColumnSet objects:



module.exports = ServiceErrorsRepository;