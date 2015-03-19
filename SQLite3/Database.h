#pragma once

#include "sqlite3.h"

namespace SQLite3
{
  ref class Statement;

  public ref class Database sealed
  {
  public:
    Database(Platform::String^ dbPath);
    virtual ~Database();

    Statement^ Prepare(Platform::String^ sql);

	int lastError();
	Platform::String^ lastErrorMsg();

  private:
    friend Statement;

    sqlite3* sqlite;
  };
}
