export interface Rate {

  rateId?: number;
  price: number;
  isActive?: boolean;
  effectiveFrom?: string;       // ISO LocalDateTime string e.g. "2026-10-11T20:10:00"
  effectiveTo?: string | null;
  changeReason?: string;
  createdAt?: string;           // ISO LocalDateTime string e.g. "2026-10-11T20:10:00"

}
