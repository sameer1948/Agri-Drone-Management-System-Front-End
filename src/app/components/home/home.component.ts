import { Component, ElementRef, ViewChild, OnInit, OnDestroy, AfterViewInit, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Rate } from '../../models/rate.model';
import { RateService } from '../../services/rate.service';
import { CropService } from '../../services/crop.service';
import { Crop } from '../../models/crop.model';


interface SprayParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
}

interface CropBlade {
  x: number;
  baseHeight: number;
  currentHeight: number;
  tilt: number;
  targetTilt: number;
  moisture: number;
  type: 'wheat' | 'paddy' | 'sugarcane';
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('droneCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private animId: number | null = null;
  private rateApi = inject(RateService);
  private cropApi = inject(CropService);

  // Flight & Simulation State
  isSpraying = true;
  activeFluid = 'nano_urea';
  flightAltitude = 75;
  batteryPercent = 94;
  tankPercent = 88;
  groundSpeed = 16.5; // km/h
  flowRate = 3.2; // L/min

  // Drone Coordinates
  drone = {
    x: 300,
    y: 180,
    targetX: 500,
    targetY: 180,
    vx: 0,
    vy: 0,
    rotorAngle: 0,
    tilt: 0,
    width: 140,
    height: 48
  };

  // Particle & Crop Systems
  private sprayParticles: SprayParticle[] = [];
  private crops: CropBlade[] = [];
  private readonly maxParticles = 600;

  // Database-Driven Crops & Pricing State
  cropsList: Crop[] = [];
  currentRate: Rate = { price: 250, isActive: true, effectiveFrom: '' };

  // Calculator State (1 Acre = 1 Tank)
  estCrop = '';
  estAcres = 5;
  estTanks = 5;
  estCost = 1250;

  ngOnInit(): void {
    this.loadRate();
    this.loadCrops();
  }

  loadRate(): void {
    this.rateApi.getCurrentRate().subscribe({
      next: (res) => {
        if (res && res.price) {
          this.currentRate = res;
          this.calculateEstimate();
        }
      },
      error: () => {
        console.warn('Could not fetch active tariff. Defaulting to ₹250/tank.');
        this.calculateEstimate();
      }
    });
  }

  loadCrops(): void {
    this.cropApi.getCrops().subscribe({
      next: (crops) => {
        this.cropsList = crops || [];
        if (this.cropsList.length > 0 && !this.estCrop) {
          this.estCrop = this.cropsList[0].name;
        }
      },
      error: (err) => {
        console.error('Failed to load crops from database:', err);
      }
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();
    this.initCrops();
    this.startLoop();
  }

  ngOnDestroy(): void {
    if (this.animId) cancelAnimationFrame(this.animId);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.canvasRef) {
      this.resizeCanvas();
      this.initCrops();
    }
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = 420;
    }
  }

  private initCrops(): void {
    const canvas = this.canvasRef.nativeElement;
    this.crops = [];
    const step = 8;
    for (let x = 0; x < canvas.width; x += step) {
      this.crops.push({
        x: x + (Math.random() * 4 - 2),
        baseHeight: 50 + Math.random() * 35,
        currentHeight: 50 + Math.random() * 35,
        tilt: 0,
        targetTilt: 0,
        moisture: 0.2,
        type: x % 24 === 0 ? 'sugarcane' : (x % 16 === 0 ? 'wheat' : 'paddy')
      });
    }
  }

  onCanvasClick(event: MouseEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    this.drone.targetX = clickX;
    this.drone.targetY = Math.min(Math.max(clickY, 60), 240);
  }

  toggleSpray(): void {
    this.isSpraying = !this.isSpraying;
    this.flowRate = this.isSpraying ? 3.2 : 0.0;
  }

  changeFluid(fluidType: string): void {
    this.activeFluid = fluidType;
  }

  private getFluidColor(): string {
    switch (this.activeFluid) {
      case 'bio_npk': return 'rgba(234, 179, 8, ';
      case 'micro_nutrients': return 'rgba(6, 182, 212, ';
      case 'nano_urea':
      default: return 'rgba(52, 211, 153, ';
    }
  }

  private startLoop(): void {
    const loop = () => {
      this.updatePhysics();
      this.renderCanvas();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  private updatePhysics(): void {
    const d = this.drone;

    const dx = d.targetX - d.x;
    const dy = d.targetY - d.y;
    d.vx += dx * 0.003;
    d.vy += dy * 0.003;
    d.vx *= 0.92;
    d.vy *= 0.92;
    d.x += d.vx;
    d.y += d.vy;

    d.tilt = d.vx * 0.035;
    d.rotorAngle += 0.45;
    this.groundSpeed = parseFloat((Math.hypot(d.vx, d.vy) * 4.2 + 8).toFixed(1));

    if (this.isSpraying) {
      const leftNozzleX = d.x - 38 * Math.cos(d.tilt);
      const leftNozzleY = d.y - 38 * Math.sin(d.tilt) + 18;
      const rightNozzleX = d.x + 38 * Math.cos(d.tilt);
      const rightNozzleY = d.y + 38 * Math.sin(d.tilt) + 18;

      for (let i = 0; i < 4; i++) {
        if (this.sprayParticles.length < this.maxParticles) {
          const colorBase = this.getFluidColor();
          this.sprayParticles.push({
            x: leftNozzleX + (Math.random() * 6 - 3),
            y: leftNozzleY,
            vx: (Math.random() - 0.5) * 1.5 + d.vx * 0.2,
            vy: Math.random() * 2.5 + 2.8,
            alpha: 0.8,
            size: Math.random() * 3.5 + 1.5,
            color: colorBase
          });
          this.sprayParticles.push({
            x: rightNozzleX + (Math.random() * 6 - 3),
            y: rightNozzleY,
            vx: (Math.random() - 0.5) * 1.5 + d.vx * 0.2,
            vy: Math.random() * 2.5 + 2.8,
            alpha: 0.8,
            size: Math.random() * 3.5 + 1.5,
            color: colorBase
          });
        }
      }
    }

    const groundY = this.canvasRef.nativeElement.height - 18;
    for (let i = this.sprayParticles.length - 1; i >= 0; i--) {
      const p = this.sprayParticles[i];
      p.vy += 0.04;
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.009;

      if (p.y >= groundY - 60) p.vx *= 0.6;
      if (p.alpha <= 0 || p.y >= groundY) {
        this.sprayParticles.splice(i, 1);
      }
    }

    this.crops.forEach((c) => {
      const dist = Math.abs(c.x - d.x);
      if (dist < 120) {
        const force = (1 - dist / 120) * (d.vx > 0 ? 0.4 : -0.4);
        c.targetTilt = force + Math.sin(Date.now() * 0.008) * 0.1;
        if (this.isSpraying) {
          c.moisture = Math.min(1.0, c.moisture + 0.004);
        }
      } else {
        c.targetTilt = Math.sin(Date.now() * 0.002 + c.x * 0.05) * 0.06;
      }
      c.tilt += (c.targetTilt - c.tilt) * 0.1;
    });
  }

  private renderCanvas(): void {
    const c = this.canvasRef.nativeElement;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, c.width, c.height);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, c.height);
    skyGrad.addColorStop(0, '#0f291e');
    skyGrad.addColorStop(0.55, '#1e4d38');
    skyGrad.addColorStop(0.85, '#2d6a4f');
    skyGrad.addColorStop(1, '#1b4332');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, c.width, c.height);

    const groundY = c.height - 10;
    this.crops.forEach((crop) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(crop.x, groundY);
      const tipX = crop.x + crop.tilt * 45;
      const tipY = groundY - crop.baseHeight;
      const cpX = crop.x + crop.tilt * 20;
      const cpY = groundY - crop.baseHeight * 0.5;

      ctx.quadraticCurveTo(cpX, cpY, tipX, tipY);

      const greenVal = Math.floor(140 + crop.moisture * 75);
      ctx.strokeStyle = `rgb(46, ${greenVal}, 64)`;
      ctx.lineWidth = crop.type === 'sugarcane' ? 3.5 : 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(160, ${greenVal + 15}, 80)`;
      ctx.fill();
      ctx.restore();
    });

    ctx.fillStyle = '#14281d';
    ctx.fillRect(0, groundY, c.width, 10);

    this.sprayParticles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color}${p.alpha})`;
      ctx.fill();
    });

    this.drawDrone(this.drone.x, this.drone.y, this.drone.tilt, this.drone.rotorAngle);
  }

  private drawDrone(x: number, y: number, tilt: number, rotorAngle: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-60, -4);
    ctx.lineTo(60, -4);
    ctx.moveTo(-45, -14);
    ctx.lineTo(45, 10);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(-28, -16, 56, 32, 10);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#10b981';
    ctx.stroke();

    ctx.fillStyle = '#064e3b';
    ctx.fillRect(-18, -4, 36, 16);
    ctx.fillStyle = this.getFluidColor() + '0.9)';
    ctx.fillRect(-16, 1, 32, 9);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-48, 14);
    ctx.lineTo(48, 14);
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.fillRect(-42, 14, 6, 8);
    ctx.fillRect(36, 14, 6, 8);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(-56, -4, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(56, -4, 3, 0, Math.PI * 2);
    ctx.fill();

    this.drawRotor(-58, -14, rotorAngle);
    this.drawRotor(58, -14, -rotorAngle);
    this.drawRotor(-26, -20, rotorAngle * 1.1);
    this.drawRotor(26, -20, -rotorAngle * 1.1);

    ctx.restore();
  }

  private drawRotor(rx: number, ry: number, angle: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-4, 0, 8, 5);

    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 4, angle, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Cost Estimator: 1 Acre = 1 Tank (Real Whole Number)
  calculateEstimate(): void {
    const acres = Math.max(1, Math.round(Number(this.estAcres) || 1));
    this.estAcres = acres;
    this.estTanks = acres; // 1:1 proportionality
    this.estCost = acres * (this.currentRate.price || 250);
  }
}