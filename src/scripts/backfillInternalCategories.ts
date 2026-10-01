import { connPool, reconcileAutomaticNumberCategories } from '../server/db/mysql/mysqlDao';

reconcileAutomaticNumberCategories(connPool.promise())
  .then(count => { console.log(`Rebuilt category and subcategory indexes for ${count} numbers.`); })
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { connPool.end(); });
