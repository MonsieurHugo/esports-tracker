import type { HttpContext } from '@adonisjs/core/http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import yaml from 'yaml'

export default class DocsController {
  /**
   * Serve OpenAPI specification as JSON
   * GET /api/docs/openapi.json
   */
  async openApiJson({ response }: HttpContext) {
    try {
      // Get the project root directory
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const projectRoot = join(__dirname, '..', '..')
      const openapiPath = join(projectRoot, 'docs', 'openapi.yaml')

      // Read and parse YAML file
      const yamlContent = await readFile(openapiPath, 'utf-8')
      const openapiSpec = yaml.parse(yamlContent)

      return response.ok(openapiSpec)
    } catch (error) {
      return response.internalServerError({
        error: 'Failed to load OpenAPI specification',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Serve OpenAPI specification as YAML
   * GET /api/docs/openapi.yaml
   */
  async openApiYaml({ response }: HttpContext) {
    try {
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const projectRoot = join(__dirname, '..', '..')
      const openapiPath = join(projectRoot, 'docs', 'openapi.yaml')

      const yamlContent = await readFile(openapiPath, 'utf-8')

      response.header('Content-Type', 'application/x-yaml')
      return response.send(yamlContent)
    } catch (error) {
      return response.internalServerError({
        error: 'Failed to load OpenAPI specification',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Serve Swagger UI HTML page
   * GET /api/docs
   */
  async swaggerUi({ response }: HttpContext) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Esports Tracker API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body {
      margin: 0;
      padding: 0;
    }
    .swagger-ui .topbar {
      background-color: #07070a;
    }
    .swagger-ui .topbar .download-url-wrapper {
      display: none;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>

  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: 'StandaloneLayout',
        persistAuthorization: true,
        withCredentials: true,
        tryItOutEnabled: true,
        displayRequestDuration: true,
        filter: true,
        syntaxHighlight: {
          activate: true,
          theme: 'monokai'
        }
      });
    };
  </script>
</body>
</html>
    `

    response.header('Content-Type', 'text/html')
    return response.send(html)
  }
}
