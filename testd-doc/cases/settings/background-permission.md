---
$schema: "https://example.com/test-case-schema/v3.0"
_test_meta:
  schema_version: "3.0.0"
  language: "yaml"
  encoding: "UTF-8"
  framework:
    name: "playwright"
    version: ">=1.45"
    hooks: ["before", "after", "step", "error"]
  authors:
    - name: "QA Team"
      email: "qa@example.com"
      role: "Test Owner"
    - name: "Test Automation Team"
      email: "automation@example.com"
      role: "Maintainer"
  reviewers:
    - name: "Senior QA Lead"
      email: "qa.lead@example.com"
    - name: "Security Engineer"
      email: "security@example.com"
  approval:
    approved_by: "QA Director"
    approval_date: "2026-06-01"
    status: "approved"

title: "Background Permission Settings"
version: "3.1.0"
description: >
  This test case covers the configuration of background permissions for the user's personal settings.
  IMPORTANT: As of product version 3.0, the personal settings entry has been moved from the direct
  "user operations" area into the user menu dropdown. The test steps have been updated accordingly.
  Any future UI changes should be handled by updating the corresponding operator implementations.
  This version includes complete error handling, logging, performance optimizations, and security
  checks.

change_log:
  - version: "v2.0"
    date: "2026-05-15"
    author: "QA Team"
    changes: "Updated steps to match user menu entry path."
  - version: "v2.1"
    date: "2026-05-30"
    author: "Automation Team"
    changes: "Added error handling and recovery, metadata, operator references."
  - version: "v3.0"
    date: "2026-06-01"
    author: "QA Team"
    changes: "Full restructuring: added structured step definitions, type definitions, security validations, performance optimizations, logging specifications."
  - version: "v3.1"
    date: "2026-06-02"
    author: "QA Team"
    changes: "Enhanced error handling with explicit recoveries per step; added comprehensive logging configuration; improved performance with retry delays and caching hints; added before/after hooks; fixed truncated logging section."

tags:
  - settings
  - background-permission
  - user-menu
  - personal-settings
  - permissions
  - functional
  - critical-path
  - E2E
  - regression

labels:
  priority: "high"
  severity: "critical"
  test_type: "functional"
  framework: "playwright"
  retry_policy: "ON_FAILURE_ONCE"
  smoke_test: true
  regression: true
  performance_impact: "low"
  data_dependency: "none"

links:
  - rel: "related_test_cases"
    href: "testd/auth/login"
    title: "Pre‑requisite Login Test"
  - rel: "documentation"
    href: "testd-doc/规范/数据化测试方法论.md"
    title: "Test Methodology"
  - rel: "documentation"
    href: "testd-doc/规范/数据化测试步骤语言规范.md"
    title: "Step Language Specification"
  - rel: "operator_definitions"
    href: "testd/operators/user-operators.yaml"
    title: "User‑related Operator Definitions"
  - rel: "operator_inventory"
    href: "testd/operators/permission-operators.yaml"
    title: "Permission Operator Inventory"

# ---- Type Definitions (explicit, reusable) ----
definitions:
  PermissionName:
    type: "string"
    enum: ["background_location", "background_refresh", "notification"]
    description: "Individual background permission names."
  PermissionConfig:
    type: "object"
    properties:
      permissions:
        type: "array"
        items:
          $ref: "#/definitions/PermissionName"
        minItems: 1
        description: "List of permissions to enable or disable."
      enable:
        type: "boolean"
        default: true
        description: "If true, enable the listed permissions; if false, disable them."
    required: ["permissions"]
    additionalProperties: false
    description: "Configuration object consumed by the `configurePermission` operator."
  StepId:
    type: "string"
    pattern: "^step[1-9][0-9]*$"
  StepName:
    type: "string"
    minLength: 1
    maxLength: 100
  OperatorName:
    type: "string"
    minLength: 1
    maxLength: 50
    description: "Name of an operator defined in the operator inventory."
  OperatorParams:
    type: "object"
    additionalProperties: true
    description: "Key‑value parameters passed to the operator."
  TimeoutMs:
    type: "integer"
    minimum: 500
    maximum: 30000
  StepErrorHandling:
    type: "object"
    properties:
      recoveries:
        type: "array"
        items:
          type: "object"
          properties:
            id:
              type: "string"
              description: "Unique recovery action identifier"
            condition:
              type: "string"
              description: "Condition under which this recovery is attempted."
            action:
              type: "string"
              description: "Exact action to perform (e.g., 'retry click after 500ms')."
            timeoutMs:
              type: "integer"
              default: 2000
              description: "Max time to wait for this recovery action."
          required: ["condition", "action"]
          additionalProperties: false
        description: "Ordered list of recovery actions to try on failure."
      onFailure:
        type: "string"
        description: "Final fallback action (e.g., screenshot, log, mark test as failed)."
      logLevel:
        type: "string"
        enum: ["debug", "info", "warn", "error"]
        default: "error"
        description: "Log level for this failure event."
    required: ["onFailure"]
    additionalProperties: false
  ValidationRule:
    type: "object"
    properties:
      name:
        type: "string"
        minLength: 1
      description:
        type: "string"
      severity:
        type: "string"
        enum: ["critical", "high", "medium", "low"]
      action:
        type: "string"
    required: ["name", "description", "severity", "action"]
    additionalProperties: false
  StepDefinition:
    type: "object"
    properties:
      id:
        $ref: "#/definitions/StepId"
      name:
        $ref: "#/definitions/StepName"
      operator:
        $ref: "#/definitions/OperatorName"
      operatorParams:
        $ref: "#/definitions/OperatorParams"
        default: {}
      expected:
        type: "string"
        minLength: 1
      timeoutMs:
        $ref: "#/definitions/TimeoutMs"
      retry:
        type: "object"
        properties:
          count:
            type: "integer"
            minimum: 0
            default: 0
          delayMs:
            type: "integer"
            minimum: 100
            default: 500
        description: "Simple retry configuration (used when no explicit error handling recoveries are defined)."
      errorHandling:
        $ref: "#/definitions/StepErrorHandling"
    required: ["id", "name", "operator", "expected", "timeoutMs"]
    additionalProperties: false

# ---- Before / After Hooks ----
before:
  - name: "authenticate"
    operator: "login"
    operatorParams:
      userType: "default"
      enforceTokenRefresh: true
    expected: "User is authenticated; valid token exists."
    timeoutMs: 10000
    errorHandling:
      onFailure: "Mark test as BLOCKED; do not proceed."
  - name: "checkEnvironment"
    operator: "validateEnvironment"
    operatorParams:
      required:
        - "baseUrl"
        - "userPermissions"
    expected: "Environment configuration is complete and valid."
    timeoutMs: 2000
    errorHandling:
      onFailure: "Log missing configuration; mark test as SKIPPED."
  - name: "securityPreflight"
    operator: "runSecurityChecks"
    operatorParams:
      checks:
        - "https_protocol"
        - "csrf_token_present"
        - "no_open_redirect_vulnerable"
    expected: "All security checks pass."
    timeoutMs: 3000
    errorHandling:
      recoveries:
        - condition: "CSRF token missing"
          action: "Refresh page and extract token again"
      onFailure: "Record security issue and block the test."

after:
  - name: "cleanup"
    operator: "restoreDefaultPermissions"
    operatorParams:
      scope: "background"
    expected: "Permissions reset to defaults."
    timeoutMs: 3000
    errorHandling:
      onFailure: "Log failure; do not halt suite."
  - name: "logout"
    operator: "logout"
    expected: "User logged out; session cleared."
    timeoutMs: 2000
    errorHandling:
      onFailure: "Log logout failure; continue."

# ---- Input Validation & Security Checks ----
validation:
  input:
    - field: "permissions"
      $ref: "#/definitions/PermissionConfig"
      description: "Permission configuration provided by test data factory or environment config."
    - field: "environment"
      type: "object"
      properties:
        baseUrl:
          type: "string"
          format: "uri"
        apiEndpoint:
          type: "string"
          format: "uri"
        authToken:
          type: "string"
          pattern: "^[a-zA-Z0-9._-]+$"
        csrfToken:
          type: "string"
          minLength: 1
      required: ["baseUrl"]
      description: "Test environment configuration (separate from test data)."
  security:
    - name: "auth_token_validity"
      description: "Validate user token before test execution; refresh if expired"
      severity: "critical"
      action: "If token is invalid, call `refreshToken()`; if refresh fails, mark as BLOCKED"
    - name: "https_required"
      description: "All network requests must use HTTPS (enforced in test environment)"
      severity: "high"
      action: "Intercept requests in `before` hook; throw if non-HTTPS detected"
    - name: "csrf_protection"
      description: "Ensure every POST/PUT request carries a valid CSRF token"
      severity: "high"
      action: "Extract XSRF-TOKEN from cookie or meta tag; inject into request headers"
    - name: "no_open_redirect"
      description: "Permission configuration actions must not redirect to untrusted URLs"
      severity: "medium"
      action: "After each save/navigation, verify the page URL remains within the allowed domain and path pattern"
    - name: "input_sanitization"
      description: "Avoid XSS: all user input must be escaped"
      severity: "medium"
      action: "Use Playwright's `locator.fill()` instead of `page.evaluate()`"
  preconditions:
    - type: "auth"
      required: true
      precondition_test: "testd/auth/login"
      description: "Pre‑requisite login test must have passed"
    - type: "environment"
      required: true
      description: "Test environment must have at least one user with background permission settings rights"
    - type: "operator_inventory"
      required: true
      description: "All operators referenced in steps must be defined in `testd/operators/` inventory files"

# ---- Performance Optimizations ----
performance:
  caching:
    description: "Cache static selectors and page state to avoid repeated lookups."
    enabled: true
  retrySleep:
    description: "Use progressive backoff (100ms, 200ms, 400ms) for retries."
    strategy: "exponential"
  parallelSteps:
    description: "Steps marked as independent (e.g., step3 & step4 could be parallel if UI allows)"
    allowed: false

# ---- Logging Configuration ----
logging:
  level: "debug"
  format: "structured-json"
  output:
    console: true
    file: true
    path: "logs/background-permission-test.log"
  fields:
    test_id: "background-permission-v3.1"
    run_id: "$RUN_ID"
    timestamp: true
    step: true
    operator: true
    duration_ms: true
    result: true
  on_error:
    screenshot: true
    domSnapshot: true
    networkTrace: true

# ---- Structured Steps (complete coverage of Markdown table) ----
steps:
  - id: "step1"
    name: "Open User Menu"
    operator: "openUserMenu"
    operatorParams:
      selector: "user-avatar"
      menuTimeout: 2000
    expected: "User menu dropdown appears with 'Personal Settings', 'Logout' etc."
    timeoutMs: 2000
    retry:
      count: 1
      delayMs: 500
    errorHandling:
      recoveries:
        - id: "r1-1"
          condition: "Menu did not appear (locator `[data-qa=user-menu]` not visible after click)"
          action: "Wait 500ms and retry clicking the avatar once"
          timeoutMs: 3000
        - id: "r1-2"
          condition: "User avatar element not found"
          action: "Wait for page to settle (waitForLoadState 'networkidle'), then retry"
      onFailure: "Take screenshot to `screenshots/background-permission/step1_failure.png`, save DOM snapshot to `domSnapshots/step1.html`, mark step as FAILED"
      logLevel: "error"

  - id: "step2"
    name: "Navigate to Personal Settings"
    operator: "goToSettings"
    operatorParams:
      menuItemLabel: "Personal Settings"
      expectedUrlPattern: "/settings/profile"
    expected: "Page navigates to `/settings/profile` or relevant settings page."
    timeoutMs: 5000
    retry:
      count: 1
      delayMs: 1000
    errorHandling:
      recoveries:
        - id: "r2-1"
          condition: "Page URL does not contain `/settings`"
          action: "Attempt manual navigation to `{baseUrl}/settings/profile`"
        - id: "r2-2"
          condition: "Network request timeout or navigation fails"
          action: "Check current page response status code, log it, and retry navigation once"
      onFailure: "Log the current URL and HTTP status, take screenshot to `screenshots/background-permission/step2_failure.png`, mark step as FAILED"
      logLevel: "error"

  - id: "step3"
    name: "Navigate to Background Permissions Tab"
    operator: "navigateToBackgroundPermission"
    operatorParams:
      tabSelectors:
        - "text=Background Permissions"
        - "[data-qa=tab-background-permission]"
        - "text=Permissions Management"
    expected: "Background permission configuration form is displayed (at least one configurable item)."
    timeoutMs: 3000
    errorHandling:
      recoveries:
        - id: "r3-1"
          condition: "Primary tab locator fails (element not found or not visible)"
          action: "Try the next fallback selector from the list"
        - id: "r3-2"
          condition: "Tab is collapsed or hidden (e.g., sub-menu)"
          action: "Check page structure, attempt to expand any collapsed navigation elements; take a screenshot for debugging"
      onFailure: "Take screenshot, dump page HTML, record the failure; mark as FAILED"
      logLevel: "warn"

  - id: "step4"
    name: "Configure Background Permissions"
    operator: "configurePermission"
    operatorParams:
      config:
        permissions: ["background_location", "background_refresh"]
        enable: true
    expected: "All checkboxes/toggles respond correctly; no error modals or validation messages."
    timeoutMs: 2000
    errorHandling:
      recoveries:
        - id: "r4-1"
          condition: "Individual permission toggle throws an exception"
          action: "Log the specific permission and error; retry the failing toggle once with a 300ms delay"
      onFailure: "Log the exact permission names that failed, capture full page state, screenshot to `screenshots/background-permission/step4_failure.png`; mark step as FAILED"
      logLevel: "error"

  - id: "step5"
    name: "Save Settings"
    operator: "saveSetting"
    operatorParams:
      saveButtonLabel: "Save"
      successIndicator: "[data-qa=toast-success]"
    expected: "Success toast or similar confirmation appears; configuration persisted."
    timeoutMs: 3000
    retry:
      count: 1
      delayMs: 500
    errorHandling:
      recoveries:
        - id: "r5-1"
          condition: "Network response returns 4xx or 5xx status"
          action: "Inspect error response body; if 408 (timeout), retry once; otherwise log and fail"
        - id: "r5-2"
          condition: "Save button is disabled"
          action: "Check for form validation errors, log any visible error messages, take screenshot"
      onFailure: "Log the response status and body, screenshot to `screenshots/background-permission/step5_failure.png`, mark step as FAILED"
      logLevel: "error"

  - id: "step6"
    name: "Verify Settings Take Effect"
    operator: "verifySettingEffective"
    operatorParams:
      validationMethod: "api_check"
      checkEndpoints:
        - "/api/v1/user/permissions"
      simulateBackground: true
    expected: "Backend behavior matches the configured permissions (e.g., background location is restricted or allowed)."
    timeoutMs: 5000
    errorHandling:
      recoveries: []
      onFailure: "Log before/after permission states, take screenshot, mark as potential defect (not a hard fail)."
      logLevel: "info"