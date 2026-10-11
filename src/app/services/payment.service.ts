import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Payment } from '../models/payment.model';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {

  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:9642/agri-drone-management-system/v1/api';

  constructor() { }

  getPaymentRecords(): Observable<Payment[]> {
    return this.http.get<Payment[]>(`${this.baseUrl}/payments`);
  }

  getPaymentByLogId(logId: number): Observable<Payment> {
    return this.http.get<Payment>(`${this.baseUrl}/payments/log/${logId}`);
  }

  createPayment(payment: Payment): Observable<Payment> {
    return this.http.post<Payment>(`${this.baseUrl}/payments`, payment);
  }

  updatePayment(paymentId: number, payment: Payment): Observable<Payment> {
    return this.http.put<Payment>(`${this.baseUrl}/payments/${paymentId}`, payment);
  }

}