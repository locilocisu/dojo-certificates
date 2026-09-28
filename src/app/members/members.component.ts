import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { EditComponent } from './edit/edit.component';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { forkJoin, Observable, Subject } from 'rxjs';
import { map, take, takeUntil } from 'rxjs/operators';
import moment from 'moment';
import { Ranks } from '../data/ranks';
import { Member, MemberWithCertificates } from '../data/member';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import { FormControl } from '@angular/forms';
import { SelectionModel } from '@angular/cdk/collections';
import { PrintService } from '../data/print.service';
import { Certificate } from '../data/certificate';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-members',
  templateUrl: './members.component.html',
  styleUrls: ['./members.component.scss']
})

export class MembersComponent implements OnInit, OnDestroy, AfterViewInit {

  private readonly unsubscribe$ = new Subject<boolean>();
  readonly dialog = inject(MatDialog);

  dataSource: MatTableDataSource<MemberPlus> = new MatTableDataSource<MemberPlus>([]);
  displayedColumns: string[] = ['select', 'rownum', 'Name', 'IdentificationID', 'City', 'State', 'Dojo', 'LastCertRank', 'LastCertDate', 'Action'];
  searchBar: FormControl = new FormControl('');

  selection = new SelectionModel<MemberPlus>(true, []);

  @ViewChild(MatSort) sort: MatSort | undefined;

  constructor(private afs: AngularFirestore, private printService: PrintService) { }

  ngOnInit(): void {
    this.searchBar.valueChanges.pipe(takeUntil(this.unsubscribe$)).subscribe(searchText => {
      this.dataSource.filter = searchText;
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }

  ngAfterViewInit(): void {
    this.afs.collection<Member>('members', ref => ref.orderBy('Name')).valueChanges({ idField: 'Id' }).pipe(takeUntil(this.unsubscribe$), map(data => {
      return data.map(member => {
        return { ...member, RankString: member?.LastCertRank ? Ranks[member?.LastCertRank] : null, LastCertDateString: member?.LastCertDate ? moment(member?.LastCertDate?.toDate()).format('MMM D YYYY') : null };
      });
    })).subscribe(data => {
      this.dataSource = new MatTableDataSource(data.sort());
      this.dataSource.filter = this.searchBar.value;
      if (this.sort) {
        this.dataSource.sort = this.sort;
      }
    });
  }

  addMember(): void {
    const dialogRef = this.dialog.open(EditComponent);
  }

  editMember(member: Member): void {
    const dialogRef = this.dialog.open(EditComponent, {
      data: member
    });
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }

    this.selection.select(...this.dataSource.data);
  }

  async print(): Promise<void> {
    let members: MemberPlus[] = [];
    if (this.selection.selected.length === 0) {
      members = this.dataSource.filteredData;
    } else {
      members = this.selection.selected.filter(x => this.dataSource.filteredData.includes(x));
    }

    const tasks: Observable<MemberWithCertificates>[] = [];
    members.forEach(m => {
      tasks.push(this.afs.doc('members/' + m.Id).collection<Certificate>('certificates').valueChanges().pipe(take(1), map(x => {
        return { ...m, certificates: x } as MemberWithCertificates;
      })));
    });
    forkJoin(tasks).subscribe(memberWithCerts => {
      this.printService.print(memberWithCerts);
    });
  }
}

export interface MemberPlus extends Member {
  RankString: string | null;
  LastCertDateString: string | null;
}
