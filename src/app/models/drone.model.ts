export interface Drone {

  droneId: string;
  droneName: string;
  droneOwnerName: string;
  droneOwnerPhone: string;
  droneStatus: DroneStatus;

}

export type DroneStatus = 'ACTIVE' | 'INACTIVE';


export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number; // current page index (0-based)
  first: boolean;
  last: boolean;
}