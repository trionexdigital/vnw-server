import { Response, NextFunction } from "express";
import { MySqlMaster } from '../db/mysql/mysqlDao';

const mySqlMaster: MySqlMaster = new MySqlMaster();

abstract class HTTPClientError extends Error {
  readonly statusCode!: number;
  readonly name!: string;

  constructor(message: object | string) {
    if (message instanceof Object) {
      super(JSON.stringify(message));
    } else {
      super(message);
    }
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class HTTP400Error extends HTTPClientError {
  readonly statusCode = 400;

  constructor(message: string | object = "Bad Request") {
    super(message);
  }
}

class HTTP404Error extends HTTPClientError {
  readonly statusCode = 404;

  constructor(message: string | object = "Not found") {
    super(message);
  }
}


export const notFoundError = (err: Error, res: Response, next: NextFunction) => {
  throw new HTTP404Error("Method not found.");
};

export const clientError = (err: Error, res: Response, next: NextFunction) => {
  if (err instanceof HTTPClientError) {
    console.warn(err);
    res.status(err.statusCode).send(err.message);
  } else {
    next(err);
  }
};

export const serverError = async (err: Error, res: Response, next: NextFunction) => {
  let query = "SELECT * FROM `env` WHERE key_id = 'NODE_ENV'";
  let executequery:any = await mySqlMaster.executeQuery(query);
  console.error(err);
  if ((executequery.rows[0].value + '').trim().toString().toLowerCase() === "production") {
    res.status(500).send("Internal Server Error");
  } else {
    res.status(500).send(err.stack);
  }
};
