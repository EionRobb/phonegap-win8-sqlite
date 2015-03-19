#include "Winerror.h"

#include "Database.h"
#include "Statement.h"

namespace SQLite3
{
  Database::Database(Platform::String^ dbPath)
    : sqlite(nullptr)
  {
    int ret = sqlite3_open16(dbPath->Data(), &sqlite);

    if (ret != SQLITE_OK)
    {
      sqlite3_close(sqlite);

      HRESULT hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, ret);
      throw ref new Platform::COMException(hresult);
    }
  }

  Database::~Database()
  {
    sqlite3_close(sqlite);
  }

  Statement^ Database::Prepare(Platform::String^ sql)
  {
    return ref new Statement(this, sql);
  }

  int Database::lastError()
  {
	  return sqlite3_errcode(sqlite);
  }

  Platform::String^ Database::lastErrorMsg()
  {
	  return ref new Platform::String(static_cast<const wchar_t*>(sqlite3_errmsg16(sqlite)));
  }
}
