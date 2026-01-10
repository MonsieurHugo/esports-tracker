import { defineConfig } from '@adonisjs/core/bodyparser'

/**
 * Body parser configuration
 */
const bodyParserConfig = defineConfig({
  /**
   * Enable/disable all body parsers
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Configuration for the JSON parser
   */
  json: {
    encoding: 'utf-8',
    limit: '1mb',
    strict: true,
    types: ['application/json', 'application/json-patch+json', 'application/vnd.api+json', 'application/csp-report'],
    convertEmptyStringsToNull: true,
  },

  /**
   * Configuration for the form parser
   */
  form: {
    encoding: 'utf-8',
    limit: '1mb',
    queryString: {},
    types: ['application/x-www-form-urlencoded'],
    convertEmptyStringsToNull: true,
  },

  /**
   * Configuration for the multipart parser
   */
  multipart: {
    autoProcess: true,
    processManually: [],
    encoding: 'utf-8',
    fieldsLimit: '2mb',
    limit: '20mb',
    types: ['multipart/form-data'],
    convertEmptyStringsToNull: true,
  },

  /**
   * Configuration for the raw parser
   */
  raw: {
    encoding: 'utf-8',
    limit: '1mb',
    queryString: {},
    types: ['text/plain'],
  },
})

export default bodyParserConfig
