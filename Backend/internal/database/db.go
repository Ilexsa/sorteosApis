package DatabaseAlborada

import (
	"database/sql"
	"fmt"
	_ "github.com/denisenkom/go-mssqldb"
)

var dataBase *sql.DB

func ConnectDB(server string, user string, pass string, database string, encrypt string) error {
	connString := fmt.Sprintf("server=%s;user id=%s;password=%s;database=%s;encrypt=%s", server,
		user, pass, database, encrypt)
	var err error
	dataBase, err = sql.Open("sqlserver", connString)
	if err != nil {
		return err
	}
	return dataBase.Ping()
}

func GetDB() *sql.DB {
	return dataBase
}
