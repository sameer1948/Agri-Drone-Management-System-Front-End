import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExportReportsComponent } from './export-reports.component';

describe('ExportReportsComponent', () => {
  let component: ExportReportsComponent;
  let fixture: ComponentFixture<ExportReportsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExportReportsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ExportReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
