const HarmonyImportDependency = require("webpack/lib/dependencies/HarmonyImportDependency");
const originalGetImportStatement =
  HarmonyImportDependency.prototype.getImportStatement;

function last(arr) {
  return arr[arr.length - 1];
}
module.exports = class DebugNamesWebpackPlugin {
  dependencyToStatement = new WeakMap();
  apply(compiler) {
    const self = this;
    compiler.hooks.normalModuleFactory.tap(
      "DebugNamesWebpackPlugin",
      (factory) => {
        factory.hooks.parser
          .for("javascript/auto")
          .tap("DebugNamesWebpackPlugin", (parser) => {
            // need to use "importSpecifier" instead of "import", because for some reason
            // HarmonyImportDependencyParserPlugin stops execution of the hook chain.
            parser.hooks.importSpecifier.tap(
              "DebugNamesWebpackPlugin",
              (statement) => {
                // capturing the output of HarmonyImportDependencyParserPlugin on the import hook
                // and associate it with the current statement
                const dependency = last(parser.state.module.dependencies);
                self.dependencyToStatement.set(dependency, statement);
              }
            );
          });
      }
    );

    if (
      HarmonyImportDependency.prototype.getImportStatement ===
      originalGetImportStatement
    ) {
      HarmonyImportDependency.prototype.getImportStatement = function () {
        const orig = originalGetImportStatement.apply(this, arguments);

        const specifiers = self.dependencyToStatement.get(this)?.specifiers;
        if (!specifiers || specifiers.length == 0) {
          return orig;
        }

        let importVarMap;
        if (this.parserScope) {
          importVarMap = this.parserScope.importVarMap;
        } else {
          // webpack 5
          let { moduleGraph } = arguments[1];
          const module = moduleGraph.getParentModule(this);
          importVarMap = moduleGraph.getMeta(module).importVarMap;
        }

        const generatedModuleName = last([...importVarMap.values()]);

        const debugImportVars = self.getDebugImportVars(
          generatedModuleName,
          specifiers
        );
        if (Array.isArray(orig)) {
          // webpack 5
          return [orig[0] + debugImportVars, orig[1]];
        } else {
          return orig + debugImportVars;
        }
      };
    }
  }

  getDebugImportVars(generatedModuleName, specifiers) {
    const importVars = specifiers
      .map((specifier) => {
        const localName = specifier.local.name;
        switch (specifier.type) {
          case "ImportSpecifier":
            return [
              localName,
              `${generatedModuleName}.${specifier.imported.name}`,
            ];
          case "ImportNamespaceSpecifier":
            return [localName, generatedModuleName];
          case "ImportDefaultSpecifier":
            return [
              localName,
              // add fallback to namespace import if there is no default export
              `${generatedModuleName}.default;if(typeof ${localName}==="undefined")${localName}=${generatedModuleName}`,
            ];
          default:
            return null;
        }
      })
      .filter(Boolean);

    if (!importVars.length) {
      return "";
    }

    const declareImportVars = `let ${importVars
      .map((importVar) => importVar[0])
      .join(",")};`;
    // init vars asynchronously to allow cycles in the dependency graph
    const asyncInitImportVars = `setTimeout(() => {${importVars
      .map((importVar) => `${importVar[0]} = ${importVar[1]}`)
      .join(";")}}, 0);`;

    return `${declareImportVars}${asyncInitImportVars}\n`;
  }
};
