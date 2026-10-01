"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mysqlDao_1 = require("../server/db/mysql/mysqlDao");
(0, mysqlDao_1.reconcileAutomaticNumberCategories)(mysqlDao_1.connPool.promise())
    .then(count => { console.log(`Rebuilt category and subcategory indexes for ${count} numbers.`); })
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => { mysqlDao_1.connPool.end(); });
//# sourceMappingURL=backfillInternalCategories.js.map