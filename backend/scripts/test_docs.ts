/**
 * Test script to verify OpenAPI documentation endpoints
 */

interface OpenAPISpec {
  openapi: string
  info: {
    title: string
    version: string
  }
  paths: Record<string, unknown>
  components?: {
    schemas?: Record<string, unknown>
  }
}

async function testDocs() {
  const baseUrl = 'http://localhost:3333'

  console.log('Testing API Documentation Endpoints...\n')

  // Test 1: Swagger UI HTML
  console.log('1. Testing Swagger UI (GET /api/docs)...')
  try {
    const response = await fetch(`${baseUrl}/api/docs`)
    const html = await response.text()
    if (response.ok && html.includes('swagger-ui')) {
      console.log('   ✓ Swagger UI page loaded successfully')
    } else {
      console.log('   ✗ Failed to load Swagger UI')
    }
  } catch (error) {
    console.log('   ✗ Error:', error instanceof Error ? error.message : error)
  }

  // Test 2: OpenAPI JSON
  console.log('\n2. Testing OpenAPI JSON (GET /api/docs/openapi.json)...')
  try {
    const response = await fetch(`${baseUrl}/api/docs/openapi.json`)
    const json = (await response.json()) as OpenAPISpec
    if (response.ok && json.openapi && json.info && json.paths) {
      console.log('   ✓ OpenAPI JSON spec loaded successfully')
      console.log(`   - OpenAPI version: ${json.openapi}`)
      console.log(`   - API title: ${json.info.title}`)
      console.log(`   - API version: ${json.info.version}`)
      console.log(`   - Total endpoints: ${Object.keys(json.paths).length}`)
      console.log(`   - Total schemas: ${Object.keys(json.components?.schemas || {}).length}`)
    } else {
      console.log('   ✗ Invalid OpenAPI JSON structure')
    }
  } catch (error) {
    console.log('   ✗ Error:', error instanceof Error ? error.message : error)
  }

  // Test 3: OpenAPI YAML
  console.log('\n3. Testing OpenAPI YAML (GET /api/docs/openapi.yaml)...')
  try {
    const response = await fetch(`${baseUrl}/api/docs/openapi.yaml`)
    const yaml = await response.text()
    if (response.ok && yaml.includes('openapi:') && yaml.includes('paths:')) {
      console.log('   ✓ OpenAPI YAML spec loaded successfully')
      console.log(`   - Response size: ${(yaml.length / 1024).toFixed(2)} KB`)
    } else {
      console.log('   ✗ Invalid OpenAPI YAML structure')
    }
  } catch (error) {
    console.log('   ✗ Error:', error instanceof Error ? error.message : error)
  }

  // Test 4: Verify some key endpoints are documented
  console.log('\n4. Verifying key endpoints are documented...')
  try {
    const response = await fetch(`${baseUrl}/api/docs/openapi.json`)
    const json = (await response.json()) as OpenAPISpec

    const keyEndpoints = [
      '/health',
      '/api/auth/login',
      '/api/auth/register',
      '/api/v1/lol/dashboard/batch',
      '/api/v1/lol/dashboard/teams',
      '/api/v1/lol/dashboard/players',
      '/api/v1/players/{slug}/profile',
      '/api/v1/admin/teams-accounts',
    ]

    const missingEndpoints = keyEndpoints.filter(
      (endpoint) => !json.paths || !json.paths[endpoint]
    )

    if (missingEndpoints.length === 0) {
      console.log(`   ✓ All ${keyEndpoints.length} key endpoints are documented`)
    } else {
      console.log(`   ✗ Missing ${missingEndpoints.length} endpoints:`)
      missingEndpoints.forEach((ep) => console.log(`     - ${ep}`))
    }
  } catch (error) {
    console.log('   ✗ Error:', error instanceof Error ? error.message : error)
  }

  console.log('\n✅ Documentation testing complete!')
  console.log(`\nAccess the interactive docs at: ${baseUrl}/api/docs`)
}

// Run tests
testDocs().catch(console.error)
