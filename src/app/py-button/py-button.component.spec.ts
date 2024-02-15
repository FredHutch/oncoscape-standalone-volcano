import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PyButtonComponent } from './py-button.component';

describe('PyButtonComponent', () => {
  let component: PyButtonComponent;
  let fixture: ComponentFixture<PyButtonComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PyButtonComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PyButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
