# debug-import-vars-webpack-plugin

This plugin adds import names as they are defined in the original source code for debugging purposes.

Example:

```
// in your code you have this import:
import React from 'react';
// now open devtools and you want to see whats behind `React`
// instead of
react__WEBPACK_IMPORTED_MODULE_3__.version
// you can now just use
React.version
// in your devtools console as you would write in the code
```

## Limitations

**This plugin is not intended for production environments**

- this plugin cannot emulate "live bindings" (e.g. export a `let` variable)
- debug import vars are not available during first (synchronous) execution of the code (as they are defined asynchronously)

## Usage

```javascript
const DebugImportVarsPlugin = require("debug-import-vars-webpack-plugin");

// webpack.config.js
module.exports = {
  plugins: [new DebugImportVarsPlugin()],
};
```
