import { DataSource } from '@steroidsjs/typeorm';

export const isDataSource = (value: unknown): value is DataSource => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return value.constructor.name === DataSource.name;
};
