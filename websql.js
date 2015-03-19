var storageParam = {
    db : null,
    dbName : null,
    path : Windows.Storage.ApplicationData.current.localFolder.path,
	journalMode : null
}

/**
     * Create a UUID
     */
function createUUID() {
	if (!window.uuidChars) {
		window.uuidChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
	}
	var uuid = new Array(36), rnd=0, r;
	for (var i = 0; i < 36; i++) {
		if (i==8 || i==13 || i==18 || i==23) {
			uuid[i] = '-';
		} else if (i==14) {
			uuid[i] = '4';
		} else {
			if (rnd <= 0x02) rnd = 0x2000000 + (Math.random()*0x1000000)|0;
			r = rnd & 0xf;
			rnd = rnd >> 4;
			uuid[i] = window.uuidChars[(i == 19) ? (r & 0x3) | 0x8 : r];
		}
	}
	return uuid.join('');
}

function SQLError(error, msg) {
    this.code = error || null;
	if (msg) {
		this.message = msg;
	} else {
		switch(error) {
			case SQLError.UNKNOWN_ERR:
				this.message = "The transaction failed for reasons unrelated to the database itself and not covered by any other error code.";
				break;
			
			case SQLError.DATABASE_ERR:
				this.message = "The statement failed for database reasons not covered by any other error code.";
				break;
			
			case SQLError.VERSION_ERR:
				this.message = "The operation failed because the actual database version was not what it should be.";
				break;
			
			case SQLError.TOO_LARGE_ERR:
				this.message = "The statement failed because the data returned from the database was too large. The SQL \"LIMIT\" modifier might be useful to reduce the size of the result set.";
				break;
			
			case SQLError.QUOTA_ERR:
				this.message = "The statement failed because there was not enough remaining storage space, or the storage quota was reached and the user declined to give more space to the database.";
				break;
			
			case SQLError.SYNTAX_ERR:
				this.message = "The statement failed because of a syntax error, or the number of arguments did not match the number of ? placeholders in the statement, or the statement tried to use a statement that is not allowed, such as BEGIN, COMMIT, or ROLLBACK, or the statement tried to use a verb that could modify the database but the transaction was read-only.";
				break;
			
			case SQLError.CONSTRAINT_ERR:
				this.message = "An INSERT, UPDATE, or REPLACE statement failed due to a constraint failure. For example, because a row was being inserted and the value given for the primary key column duplicated the value of an existing row.";
				break;
			
			case SQLError.TIMEOUT_ERR:
				this.message = "A lock for the transaction could not be obtained in a reasonable time.";
				break;
			
		}
	}
}

SQLError.UNKNOWN_ERR = 0;
SQLError.DATABASE_ERR = 1;
SQLError.VERSION_ERR = 2;
SQLError.TOO_LARGE_ERR = 3;
SQLError.QUOTA_ERR = 4;
SQLError.SYNTAX_ERR = 5;
SQLError.CONSTRAINT_ERR = 6;
SQLError.TIMEOUT_ERR = 7;



/**
 * Open database
 *
 * @param name              Database name
 * @param version           Database version
 * @param display_name      Database display name
 * @param size              Database size in bytes
 * @return                  Database object
 */
function openDatabase(name, version, display_name, size) {
    if (storageParam.db != null) { storageParam.db.close(); }
    if (String(name).match(new RegExp(/\?|\\|\*|\||\"|<|>|\:|\//g))) {
        return null;
        //throw new Error("invalid name error");
    };
    storageParam.dbName = storageParam.path + "\\" + name + ".sqlite";
    storageParam.db = new SQLite3.Database(storageParam.dbName);
    
    var statement = storageParam.db.prepare("SELECT sqlite_version()");
    statement.step(); 
    var sqliteVersion = statement.columnDouble(0);
    statement.close();
	if (sqliteVersion >= 3.8) {
		statement = storageParam.db.prepare("PRAGMA journal_mode=WAL");
	} else {
		statement = storageParam.db.prepare("PRAGMA journal_mode=MEMORY");
	}
	statement.step();
	statement.close();

    statement = storageParam.db.prepare("PRAGMA journal_mode");
    statement.step(); 
    storageParam.journalMode = statement.columnText(0).toLowerCase();
    statement.close();
	
	statement = storageParam.db.prepare("PRAGMA temp_store=MEMORY");
	statement.step();
	statement.close();
	
	statement = storageParam.db.prepare("PRAGMA page_size=4096");
	statement.step();
	statement.close();


    return new Database();
}


function Database() { }

/**
 * Start a transaction.
 * Does not support rollback in event of failure.
 *
 * @param process {Function}            The transaction function
 * @param successCallback {Function}
 * @param errorCallback {Function}
 */
Database.prototype.transaction = function (process, errorCallback, successCallback) {
    var tx = new SQLTransaction();
    tx.successCallback = successCallback;
    tx.errorCallback = errorCallback;
	setImmediate(function() {
		try {
            tx.beginTransaction();
			process(tx);
			tx.commitTransaction();
			if (tx.successCallback) {
				setImmediate(function() {
					try {
						tx.successCallback();
					} catch (e) {
						if (typeof tx.errorCallback === "function") {
							tx.errorCallback("Error in success callback");
						}
					}
				});
			}
		} catch (e) {
            tx.rollbackTransaction();
			if (tx.errorCallback) {
				try {
					tx.errorCallback(new SQLError(SQLError.SYNTAX_ERR));
				} catch (ex) {
					console.log("Transaction error calling user error callback: " + e);
				}
			}
		}
	});
}



function queryQueue() { };


/**
 * Transaction object
 * PRIVATE METHOD
 * @constructor
 */
function SQLTransaction () {
    
    // Set the id of the transaction
    this.id = createUUID();

    // Callbacks
    this.successCallback = null;
    this.errorCallback = null;

    // Query list
    this.queryList = {};
};

SQLTransaction.prototype.beginTransaction = function() {
	if (storageParam.journalMode == "wal") {
		statement = storageParam.db.prepare("BEGIN IMMEDIATE");
	} else {
		statement = storageParam.db.prepare("SAVEPOINT a" + this.id.substr(0,8));
	}
	statement.step();
	statement.close();
}
SQLTransaction.prototype.rollbackTransaction = function() {
	if (storageParam.journalMode == "wal") {
		statement = storageParam.db.prepare("ROLLBACK");
	} else {
		statement = storageParam.db.prepare("ROLLBACK TO SAVEPOINT a" + this.id.substr(0,8));
	}
	statement.step();
	statement.close();
}
SQLTransaction.prototype.commitTransaction = function() {
	if (storageParam.journalMode == "wal") {
		statement = storageParam.db.prepare("COMMIT");
	} else {
		statement = storageParam.db.prepare("RELEASE SAVEPOINT a" + this.id.substr(0,8));
	}
	statement.step();
	statement.close();
}

/**
 * Mark query in transaction as complete.
 * If all queries are complete, call the user's transaction success callback.
 *
 * @param id                Query id
 */
SQLTransaction.prototype.queryComplete = function (id) {
    delete this.queryList[id];
};

/**
 * Mark query in transaction as failed.
 *
 * @param id                Query id
 * @param reason            Error message
 */
SQLTransaction.prototype.queryFailed = function (id, reason) {

    // The sql queries in this transaction have already been run, since
    // we really don't have a real transaction implemented in native code.
    // However, the user callbacks for the remaining sql queries in transaction
    // will not be called.
    this.queryList = {};

    this.rollbackTransaction();
    if (this.errorCallback) {
        try {
            this.errorCallback(reason);
        } catch (e) {
            console.log("Transaction error calling user error callback: " + e);
        }
    }
};

/**
 * Execute SQL statement
 *
 * @param sql                   SQL statement to execute
 * @param params                Statement parameters
 * @param successCallback       Success callback
 * @param errorCallback         Error callback
 */
SQLTransaction.prototype.executeSql = function (sql, params, successCallback, errorCallback) {

    var isDDL = function (query) {
        var cmdHeader = String(query).toLowerCase().split(" ")[0];
        if (cmdHeader == "drop" || cmdHeader == "create" || cmdHeader == "alter" || cmdHeader == "truncate") {
            return true;
        }
        return false;
    };

    // Init params array
    if (typeof params === 'undefined' || params == null) {
        params = [];
    }

    // Create query and add to queue
    var query = new DB_Query(this);

    // Save callbacks
    query.successCallback = successCallback;
    query.errorCallback = errorCallback;

    // Call native code
    
    var statement = null;
    var type = function (obj) {
        var typeString;
        typeString = Object.prototype.toString.call(obj);
        return typeString.substring(8, typeString.length - 1).toLowerCase();
    }

    try {
        if (isDDL(sql)) {
            
            statement = storageParam.db.prepare(sql);
            statement.step();
            if (resultCode === SQLite3.ResultCode.error) {
                if (typeof query.errorCallback === 'function') {
                    query.errorCallback(new SQLError(SQLError.SYNTAX_ERR));
                }
                return;
            }
            statement.close();
            completeQuery(query.id, "");
        } else {
            statement = storageParam.db.prepare(sql);
            var index, resultCode;
            params.forEach(function (arg, i) {
                index = i + 1;
                
                switch (type(arg)) {
                    case 'number':
                        if (arg % 1 === 0) {
                            resultCode = statement.bindInt(index, arg);
                        } else {
                            resultCode = statement.bindDouble(index, arg);
                        }
                        break;
					case 'undefined':
                        resultCode = statement.bindText(index, 'undefined');
						break;
					case 'boolean':
                        resultCode = statement.bindText(index, arg ? 'true' : 'false');
						break;
                    case 'string':
                        resultCode = statement.bindText(index, arg);
                        break;
                    case 'null':
                        resultCode = statement.bindNull(index);
                        break;
                    default:
                        if (typeof query.errorCallback === 'function') {
                            query.errorCallback(new SQLError(SQLError.DATABASE_ERR));
                        }
                        return;
                }
                if (resultCode !== SQLite3.ResultCode.ok) {
                    if (typeof query.errorCallback === 'function') {
                        query.errorCallback(new SQLError(SQLError.DATABASE_ERR));
                    }
                    return;
                }
            });
            // get data
            var result = new Array();
            // get the Result codes of SQLite3
            resultCode = statement.step();
            if (resultCode === SQLite3.ResultCode.row) {
                do{
                    var row = new Object();
                    for (var j = 0 ; j < statement.columnCount() ; j++) {
                        // set corresponding type
                        if (statement.columnType(j) == "1") {
                            row[statement.columnName(j)] = statement.columnInt(j);
                        } else if (statement.columnType(j) == "2") {
                            row[statement.columnName(j)] = statement.columnDouble(j);
                        } else if (statement.columnType(j) == "3") {
                            row[statement.columnName(j)] = statement.columnText(j);
                        } else if (statement.columnType(j) == "5") {
                            row[statement.columnName(j)] = null;
                        } else {
                            if (typeof query.errorCallback === 'function') {
                                query.errorCallback(new SQLError(SQLError.DATABASE_ERR));
                            }
                            return;
                        }
                    
                    }
                    result.push(row);
                } while (statement.step() === SQLite3.ResultCode.row);
                // SQL error or missing database
            } else if (resultCode === SQLite3.ResultCode.error) {
                if (typeof query.errorCallback === 'function') {
                    query.errorCallback(new SQLError(SQLError.SYNTAX_ERR));
                }
                return;
            }
            completeQuery(query.id, result);
            statement.close();
        }
        
    } catch (e) {
        failQuery(e.description, query.id)
    }
};

/**
 * Callback from native code when query is complete.
 * PRIVATE METHOD
 *
 * @param id   Query id
 */
function completeQuery(id, data) {
    var query = queryQueue[id];
    if (query) {
        try {
            delete queryQueue[id];

            // Get transaction
            var tx = query.tx;

            // If transaction hasn't failed
            // Note: We ignore all query results if previous query
            //       in the same transaction failed.
            if (tx && tx.queryList[id]) {

                // Save query results
                var r = new SQLResultSet();
                r.rows.resultSet = data;
                r.rows.length = data.length;
				if (storageParam.db.lastInsertRowId && storageParam.db.changesCount) {
					r.insertId = storageParam.db.lastInsertRowId();
					r.rowsAffected = storageParam.db.changesCount();
				} else {
					try {
						statement = storageParam.db.prepare("SELECT last_insert_rowid(), changes()");
						statement.step();
						r.insertId = statement.columnInt(0);
						r.rowsAffected = statement.columnInt(1);
					} catch (ex) {} finally {
						statement.close();
					}
				}
				
				if (typeof query.successCallback === 'function') {
					try {
						query.successCallback(query.tx, r);
					} catch (ex) {
						console.log("executeSql error calling user success callback: " + ex);
					}
				}

                tx.queryComplete(id);
            }
        } catch (e) {
            if (typeof query.errorCallback === 'function') {
                query.errorCallback(new SQLError(SQLError.UNKNOWN_ERR));
            } else {
                console.log("executeSql error: " + e);
            }
       } 
    }
}

/**
 * Callback from native code when query fails
 * PRIVATE METHOD
 *
 * @param reason            Error message
 * @param id                Query id
 */
function failQuery(reason, id) {
    var query = queryQueue[id];
    if (query) {
        try {
            delete queryQueue[id];

            // Get transaction
            var tx = query.tx;

            // If transaction hasn't failed
            // Note: We ignore all query results if previous query
            //       in the same transaction failed.
            
            if (tx && tx.queryList[id]) {
                tx.queryList = {};

                try {
                    if (typeof query.errorCallback === 'function') {
                        
                        query.errorCallback(new SQLError(SQLError.SYNTAX_ERR));
                        return;
                    }
                } catch (ex) {
                    console.log("executeSql error calling user error callback: " + ex);
                }

                tx.queryFailed(id, reason);
            }

        } catch (e) {
            if (typeof query.errorCallback === 'function') {
                query.errorCallback(new SQLError(SQLError.UNKNOWN_ERR));
            } else {
                console.log("executeSql error: " + e);
            }
        } 
    }
}

/**
 * SQL query object
 * PRIVATE METHOD
 *
 * @constructor
 * @param tx                The transaction object that this query belongs to
 */
function DB_Query(tx) {

    // Set the id of the query
    this.id = createUUID();

    // Add this query to the queue
    queryQueue[this.id] = this;

    // Init result
    this.resultSet = [];

    // Set transaction that this query belongs to
    this.tx = tx;

    // Add this query to transaction list
    this.tx.queryList[this.id] = this;

    // Callbacks
    this.successCallback = null;
    this.errorCallback = null;

};

/**
 * SQL result set object
 * PRIVATE METHOD
 * @constructor
 */
function SQLResultSetList () {
    this.resultSet = [];    // results array
    this.length = 0;        // number of rows
};

/**
 * Get item from SQL result set
 *
 * @param row           The row number to return
 * @return              The row object
 */
SQLResultSetList.prototype.item = function (row) {
    return this.resultSet[row];
};

/**
 * SQL result set that is returned to user.
 * PRIVATE METHOD
 * @constructor
 */
function SQLResultSet () {
    this.rows = new SQLResultSetList();
	this.insertId = -1;     // last primary key id
	this.rowsAffected = -1; // number of rows affected
};
