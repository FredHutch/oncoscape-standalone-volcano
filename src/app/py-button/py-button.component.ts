import { Component, OnInit } from '@angular/core';
import { PythonService } from '../python.service';

@Component({
  selector: 'app-py-button',
  templateUrl: './py-button.component.html',
  styleUrls: ['./py-button.component.css'],
})
export class PyButtonComponent implements OnInit {

  private result: HTMLDivElement;
  private btn: HTMLButtonElement;

  ngOnInit(): void {
    this.result = document.getElementById("result") as HTMLDivElement;
    this.btn = document.getElementById("deseq-btn") as HTMLButtonElement;

    this.ps.logs$().subscribe((log) => {
      this.result.innerHTML += log;
    });


    this.ps.workerStatus$(this.ps.getWorkerIDByName("DESeq2")).subscribe((busy) => {
      this.btn.disabled = busy;
      // add a tooltip to the button
      this.btn.title = busy ? "Worker is busy" : "Run DESeq2";
    });
  }

  async deseqClick() {
    this.result.innerHTML = "Running...";
    const workerID = this.ps.getWorkerIDByName("DESeq2");
    const res = await this.ps.runPython(workerID, 'hi.py', "DESeq2_" + new Date().toLocaleString(), {
      'payload_1': 10,
      'payload_2': 25,
    });
    if (res.success) {
        this.result.innerHTML = JSON.stringify(res.result);
    } else {
        this.result.innerHTML = res.error;
    }
  }

  constructor(private ps: PythonService) {}
}
