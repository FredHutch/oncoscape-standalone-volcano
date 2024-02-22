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
 * Run python code in a web worker. Two variables will be made available to the python code in the global scope:
 * - js_payload: the payload object passed to this function
 * - js_print: a function that can be used to print messages to the console. It takes one required argument, the message to be printed. It can also take an optional second argument, which is the severity of the message. The severity can be one of "log", "info", "warn", "error".
 *
 * To ensure `pyodide.runPythonAsync` returns the last value of the Python script, the file should end with the following lines:
 *
 * ```py
 *  sys.stdout = io.StringIO()
 *  json.dumps(res)
 * ```
 *
 * Where res is a `WorkerResponse` (see `worker.service.types.ts`) object.
 *
 * @param {string} filePath Path to python file.
 * @param {Object} payload Payload to be injected into python code. Will be available as 'js_payload' in python code.
 *
 * @returns {WorkerResponse} The result of the python code.
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
      return { status: "error", data: error, type: "error" };
    }

    // inject payload into python code
    pyodide.globals.set("js_payload", payload)

    // inject print function into python code
    const print = (msg, level='info') => {

      // ignore messages that are just newlines
      if (msg === '\n') return;

      this.postMessage({
        status: 'log',
        data: {msg, level},
        type: null
      }
      );
      switch (level) {
        case 'log':
          console.log(`[${filePath}] ${msg}`)
          break;
        case 'info':
          console.info(`[${filePath}] ${msg}`)
          break;
        case 'warn':
          console.warn(`[${filePath}] ${msg}`)
          break;
        case 'error':
          console.error(`[${filePath}] ${msg}`)
          break;
        default:
          console.log(`[${filePath}] ${msg}`)
      }
    };
    pyodide.globals.set("js_print", print);

    console.log("[PYODIDE WORKER] Running Python code.");

    // We can directly return the result of the python code, as it is a JSON string that comforms to a WorkerResponse, as defined in worker.service.ts
    const response = JSON.parse(await pyodide.runPythonAsync(pythonCode));
    if (response.status === "error") {
      console.error("[PYODIDE WORKER] Python code returned error.", response);
      return response;
    }
    console.log("[PYODIDE WORKER] Python code successfully completed.");
    return response;
  } catch (error) {
    console.error("[PYODIDE WORKER] Error running Python code.", error);
    return { status: "error", data: error, type: "error"};
  }
}

// await message from main script, running the specified command
// 'install': installation and intialization of python packages. 'run': run python code.
var onmessage = async function (params) {
  console.log(
    "[PYODIDE WORKER] Message received from main script:",
    params.data
  );

  const { cmd, data } = params.data;

  //switch statement to check given command, more functions may be added later
  switch (cmd) {
    case "install":
      await installPackages(data);
      self.postMessage({ status: "success", data: null, type: null });
      break;
    case "run":
      const res = await runPython(data["fp"], data["data"]);
      self.postMessage(res);
      break;
    default:
      console.error(`[PYODIDE WORKER] Unknown command: ${cmd}]`);
      self.postMessage({
        status: "error",
        data: `Unknown command: ${cmd}`,
      });
  }
};
