import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatFormFieldControl } from '@angular/material';
import { DEAService } from 'app/service/dea/dea.service';
import { DiffExpPayloads, PythonService } from 'app/service/python.service';
import mapData from "assets/data/map.json";

@Component({
  selector: 'app-dea-input',
  templateUrl: './dea-input.component.html',
  styleUrls: ['./dea-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeaInputComponent {

  static DEA_METHOD: 'server' | 'worker' = 'worker'

  public rawCounts: any;
  public sids: string[] = [];
  public useColumnMapping: boolean = false;
  public analysisName: string = "My DEA Analysis";
  private _cohortA: string[] = [];
  private _cohortB: string[] = [];
  set cohortA(value: string) {
    // split by newline and trim each line
    this._cohortA = value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  }
  set cohortB(value: string) {
    // split by newline and trim each line
    this._cohortB = value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  }

  canRunDEA(): boolean {
    return this._cohortA.length > 0 && this._cohortB.length > 0 && this.rawCounts;
  }

  setRawCounts(payload: {filename: string, data: any, sids: string[]}) {
    this.rawCounts = payload.data;
    this.sids = payload.sids;
  }

  public runDiffExpJob() {

    const diffExpData = {
      map: null,
      data: null,
      cohortA:  null,
      cohortB: null,
    }

    // build the payload like it is in Oncoscape
    // console.warn("REMOVE THIS> TAKING THE FIRST 1000 GENES FOR TESTING!!!!")
    diffExpData.data = this.rawCounts//.slice(0, 1000);
    diffExpData.cohortA = {
      n: "Cohort A",
      pids: this._cohortA,
      sids: this._cohortA,
    }
    diffExpData.cohortB = {
      n: "Cohort B",
      pids: this._cohortB,
      sids: this._cohortB,
    }
    diffExpData.map = this.useColumnMapping ? mapData :
    // cheat by using the column names as the sids from the csv
    Array.from({length: this.sids.length}, (_, i) => {
      return {
        i: i,
        s: this.sids[i],
      }
    });

    console.log("diffexpdata", diffExpData)

    if (DeaInputComponent.DEA_METHOD === 'worker') {
      const workerRes = PythonService.instance.newWorker()
    if (workerRes.success) {
      PythonService.instance.runJob<DiffExpPayloads>(
        workerRes.workerId,
        this.analysisName,
        {
          cmd: "install",
          data: {
            deps: [
              // for some reason micropip cant find some pypi packages, so we have to use the explicit urls to the wheels
              "https://files.pythonhosted.org/packages/8a/87/201514af3bf08db52e11b7d94e6129f0a75503194b81614ff48883101c4c/anndata-0.10.3-py3-none-any.whl",
              "numpy",
              "pandas",
              "scikit-learn",
              "scipy",
              "statsmodels",
              "matplotlib",
              "h5py",
              "https://files.pythonhosted.org/packages/ef/82/7a9d0550484a62c6da82858ee9419f3dd1ccc9aa1c26a1e43da3ecd20b0d/natsort-8.4.0-py3-none-any.whl",
              "https://files.pythonhosted.org/packages/c0/b0/cb1fbd419050d35de852005594b0d5f1c9183f0d319c02ec34764faead92/pydeseq2-0.4.4-py3-none-any.whl",
            ],
            method: "pyodide",
          },
        },
        [
          {
            name: "Install Dependencies",
          },
          {
            name: "Run Differential Expression",
            payload: {
              cmd: "run",
              data: {
                fp: "differential_expression.py",
                data: diffExpData,
              },
            },
          }
        ],
        {
          type: "differentialExpression",
          showSnackbarOnStart: false
        }
      );
    } else {
      throw new Error(workerRes.error);
    }
    } else if (DeaInputComponent.DEA_METHOD ==='server') {
      DEAService.instance.runDiffExpJob(diffExpData)
    }

  }

  constructor() { }
}
