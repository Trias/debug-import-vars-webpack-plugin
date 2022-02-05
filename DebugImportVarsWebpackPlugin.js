const HarmonyImportDependency = require("webpack/lib/dependencies/HarmonyImportDependency");
const Dependency = require("webpack/lib/Dependency");
let makeSerializable;
try {
  makeSerializable = require("webpack/lib/util/makeSerializable");
} catch (e) {
  makeSerializable = () => {};
}

module.exports = class DebugImportVarsWebpackPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap(
      "DebugImportVarsWebpackPlugin",
      (compilation) => {
        compilation.dependencyTemplates.set(
          DebugImportVarsDependency,
          new DebugImportVarsDependency.Template()
        );
      }
    );
    compiler.hooks.normalModuleFactory.tap(
      "DebugImportVarsWebpackPlugin",
      (factory) => {
        factory.hooks.parser
          .for("javascript/auto")
          .tap("DebugImportVarsWebpackPlugin", (parser) => {
            // need to use "importSpecifier" instead of "import", because for some reason
            // HarmonyImportDependencyParserPlugin stops execution of the hook chain.
            parser.hooks.importSpecifier.tap(
              "DebugImportVarsWebpackPlugin",
              (statement) => {
                // capturing the output of HarmonyImportDependencyParserPlugin on the import hook
                const dependency = last(parser.state.module.dependencies);

                if (dependency instanceof HarmonyImportDependency) {
                  parser.state.module.addDependency(
                    new DebugImportVarsDependency(
                      dependency,
                      statement.specifiers
                    )
                  );
                }
              }
            );
          });
      }
    );
  }
};

class DebugImportVarsDependency extends Dependency {
  constructor(harmonyDependency, specifiers) {
    super();
    this.harmonyDependency = harmonyDependency;
    this.specifiers = specifiers?.map((specifier) => {
      return {
        type: specifier.type,
        localName: specifier.local?.name,
        importName: specifier.imported?.name,
      };
    });
  }

  hash(...args) {
    return this.harmonyDependency.hash(...args);
  }

  serialize(context) {
    const { write } = context;
    this.harmonyDependency.serialize(context);
    write(this.specifiers);
    super.serialize(context);
  }

  deserialize(context) {
    const { read } = context;
    this.harmonyDependency = new HarmonyImportDependency().deserialize(context);
    this.specifiers = read();
    super.deserialize(context);
  }
}

makeSerializable(DebugImportVarsDependency, "DebugImportVarsDependency");

DebugImportVarsDependency.Template = class DebugImportVarsDependencyTemplate {
  apply(dep, source, runtimeOrTemplateContextInWebpack5) {
    const moduleGraph = runtimeOrTemplateContextInWebpack5?.moduleGraph;
    const generatedModuleName = dep.harmonyDependency.getImportVar(moduleGraph);
    const debugImportVar = this.getDebugImportVar(
      generatedModuleName,
      dep.specifiers
    );
    source.insert(0, debugImportVar);
  }

  getDebugImportVar(generatedModuleName, specifiers) {
    const importVars = specifiers
      .map((specifier) => {
        const localName = specifier.localName;
        switch (specifier.type) {
          case "ImportSpecifier":
            return [
              localName,
              `${generatedModuleName}.${specifier.importedName}`,
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

function last(arr) {
  return arr[arr.length - 1];
}
