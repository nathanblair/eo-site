var sqlite3 = require('sqlite3')

function Database(path) {
	this.db = new sqlite3.Database(path, sqlite3.OPEN_READWRITE, function(error) {
		return 'Error: ' + error
	})
}
//Stuff

exports.Database = Database
