// import pyodide
self.languagePluginUrl = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/";
importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

let pyodide; // define the pyodide variable in a global scope

// initialize pyodide and all packages/dependencies required for the project
async function installPackages({ deps, method = "pyodide" }) {
  console.log("[PYODIDE WORKER] Importing packages");
  // define pyodide variable and load micropip for installation
  pyodide = await loadPyodide();
  if (method === "micropip") {
    await pyodide.loadPackage(["micropip"]);
    const micropip = pyodide.pyimport("micropip");
    await micropip.install(deps, keep_going=true, deps=false);
  } else if (method === "pyodide") {
    await pyodide.loadPackage(deps);
  }
  console.log("[PYODIDE WORKER] Packages imported.");
}

/**
 *
 * @param {string} filePath Path to python file to be run.
 * @param {Object} payload Payload to be injected into python code. Each key should have a corresponding {{key}} in the python code.
 * @returns {Object} JSON object of the python code output. If error, returns {error: error}.
 */
async function runPython(filePath, payload) {
  if (!pyodide) {
    pyodide = await loadPyodide();
  }

  console.log("[PYODIDE WORKER] Loading Python code.");

  try {
    // load local file
    try {
      pythonCode = await fetch(filePath).then((response) => response.text());
    } catch (error) {
      console.error(`[PYODIDE WORKER] Error loading file: ${filePath}`, error);
      return { error: error };
    }

    // inject payload into python code
    pyodide.globals.set("js_payload", payload)
    const log = (pythonFilename, msg) => {
      this.postMessage({ cmd: "log", data: msg });
      console.log(`[${pythonFilename}] ${msg}`)
    };
    pyodide.globals.set("js_log", log);

    console.log("[PYODIDE WORKER] Running Python code.");
    const res = await pyodide.runPythonAsync(pythonCode);
    console.log("[PYODIDE WORKER] Python code done.");
    return JSON.parse(res);
  } catch (error) {
    console.error("[PYODIDE WORKER] Error running Python code.", error);
    return { error: error };
  }
}

// await message from main script, running the specified command
// 'install': installation and intialization of python packages. 'run': run python code.
var onmessage = async function (params) {
  console.log(
    "[PYODIDE WORKER] Message received from main script:",
    params.data
  );

  //switch statement to check given command, more functions may be added later
  switch (params.data["cmd"]) {
    case "install":
      await installPackages(params.data["data"]);
      self.postMessage({ cmd: "done" });
      break;
    case "run":
      const res = await runPython(params.data["fp"], params.data["payload"]);
      if (res.error) {
        self.postMessage({ cmd: "error", data: res.error });
        break;
      }
      self.postMessage({ cmd: "done", data: res });
      break;
    default:
      console.error(`[PYODIDE WORKER] Unknown command: ${params.data["cmd"]}]`);
      self.postMessage({
        cmd: "error",
        data: `Unknown command: ${params.data["cmd"]}`,
      });
  }
};
