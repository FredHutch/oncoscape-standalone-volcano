import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-counter',
  templateUrl: './counter.component.html',
  styleUrls: ['./counter.component.css']
})
export class CounterComponent implements OnInit {

  public counterValue = 0;

  increment() {
    this.counterValue++;
  }

  constructor() { }

  ngOnInit() {
  }

}
