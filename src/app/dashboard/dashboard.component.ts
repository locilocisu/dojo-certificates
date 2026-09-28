import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {

  constructor(
    public auth: AngularFireAuth, 
    public router: Router) { }

  ngOnInit(): void {
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['login']);
  }
}
