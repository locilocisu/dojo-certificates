import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AbstractControl, FormControl, FormGroup, FormGroupDirective, ValidatorFn } from '@angular/forms';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, map, takeUntil } from 'rxjs/operators';
import moment from 'moment';
import firebase from 'firebase/compat/app';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Member } from '../../data/member';
import { Certificate } from '../../data/certificate';
import { Ranks } from '../../data/ranks';
import { Timestamp } from '@firebase/firestore-types';

type CertificateExtra = Certificate & {
  RankString: string,
  DateString: string,
  CodeNumber: string,
  Id: string,
}

@Component({
  selector: 'app-edit',
  templateUrl: './edit.component.html',
  styleUrls: ['./edit.component.scss']
})

export class EditComponent implements OnInit, OnDestroy {


  private unsubscribe$ = new Subject<void>();

  existingCertificateIDs: BehaviorSubject<{ Code: string, Number: number }[]> = new BehaviorSubject<{ Code: string, Number: number }[]>([]);
  certificateIDsForFilter: Subject<{ Code: string, Number: number }[]> = new Subject<{ Code: string, Number: number }[]>();
  existingCertificateCodes: string[] = [];
  existingCertificateIDDictionary: { [key: string]: number } = {};
  ranks = Object.keys(Ranks).map(key => {
    return { value: key, label: Ranks[key] };
  });

  certificates: Observable<CertificateExtra[]> | undefined;
  certificatesChangeSubscription: Subscription | undefined;

  memberForm = new FormGroup({
    Name: new FormControl('', { nonNullable: true }),
    IdentificationID: new FormControl(''),
    City: new FormControl(''),
    Country: new FormControl(''),
    Dojo: new FormControl('')
  });

  certificateForm = new FormGroup({
    Rank: new FormControl(''),
    Date: new FormControl(''),
    Code: new FormControl(''),
    Number: new FormControl(null),
  });

  inlineCertificateForm = new FormGroup({
    Rank: new FormControl(''),
    Date: new FormControl<Date | null>(null),
    Code: new FormControl(''),
    Number: new FormControl<Number | null>(null),
  });

  inlineDate = new FormControl('');

  currentEditingCertificate: CertificateExtra | null = null;

  lastDeletedCertificate: Certificate | null = null;
  lastDeletedMemberAndCertificates: { Member: Member | undefined, Certificates: Certificate[] } | null = null;

  constructor(@Inject(MAT_DIALOG_DATA) public data: Member, private afs: AngularFirestore, private snackBar: MatSnackBar) { }

  get isEdit(): boolean {
    return this.data ? true : false;
  }

  ngOnInit(): void {
    if (this.isEdit) {
      this.memberForm.patchValue(this.data);
      this.setupCertificateObservable();
    }

    this.memberForm.valueChanges.pipe(debounceTime(1000), takeUntil(this.unsubscribe$)).subscribe(formVals => {
      if (this.memberForm.valid) {
        if (this.isEdit) {
          this.afs.doc('members/' + this.data.Id).update(formVals);
        } else {
          this.afs.collection('members').add(formVals).then(doc => {
            this.data = { Id: doc.id, 
              LastCertDate: null, 
              LastCertRank: null, 
              Name: formVals.Name ?? '', 
              City: formVals.City ?? '',  
              Dojo: formVals.Dojo ?? '',
              IdentificationID: formVals.IdentificationID ?? '',
              Country: formVals.Country ?? ''
            };
            this.setupCertificateObservable();
          });
        }
      }
    });

    this.afs.collectionGroup<Certificate>('certificates').valueChanges().pipe(takeUntil(this.unsubscribe$)).subscribe(data => {
      this.existingCertificateIDs.next(data);
      this.certificateIDsForFilter.next(data);
      this.existingCertificateCodes = [...new Set(data.map(x => x.Code))];
      this.existingCertificateCodes.forEach(x => {
        const nums = data.filter(cert => cert.Code === x).map(cert => cert.Number);
        this.existingCertificateIDDictionary[x] = Math.max(...nums);
      });
    });

    this.certificateForm.controls.Code.valueChanges.pipe(takeUntil(this.unsubscribe$)).subscribe(code => {
      if (!this.certificateForm.controls.Number.value) {
        this.setCertNumberToNextAvailable(this.certificateForm.controls.Number, code);
      }
    });

    this.certificateIDsForFilter.pipe(takeUntil(this.unsubscribe$)).subscribe(ids => {
      this.certificateForm.setValidators([forbiddenCertNumberValidator(ids)]);
      this.certificateForm.updateValueAndValidity();
      this.inlineCertificateForm.setValidators([forbiddenCertNumberValidator(ids)]);
      this.inlineCertificateForm.updateValueAndValidity();
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  private setupCertificateObservable(): void {
    this.certificates = this.afs.doc('members/' + this.data.Id).collection<Certificate>('certificates').valueChanges({ idField: 'Id' }).pipe(map(data => {
      const sortedCerts = data.sort((a, b) => a.Date.toMillis() - b.Date.toMillis());
      return sortedCerts.map(cert => {
        return {
          ...cert,
          RankString: Ranks[cert.Rank],
          DateString: moment(cert.Date.toDate()).format('MMM D YYYY'),
          CodeNumber: !cert.Code ? 'Not Assigned' : cert.Code + '-' + this.pad(cert.Number, 3),
          Id: cert.Id,
          isEditing: false
        };
      });
    }));

    if (this.certificatesChangeSubscription) {
      this.certificatesChangeSubscription.unsubscribe();
    }
    this.certificatesChangeSubscription = this.certificates.pipe(takeUntil(this.unsubscribe$)).subscribe(data => {
      const sortedCerts = data.sort((a, b) => a.Date.toMillis() - b.Date.toMillis());
      if (data.length > 0) {
        this.afs.doc('members/' + this.data.Id).update({ LastCertDate: sortedCerts[sortedCerts.length - 1].Date, LastCertRank: sortedCerts[sortedCerts.length - 1].Rank });
      } else {
        this.afs.doc('members/' + this.data.Id).update({ LastCertDate: firebase.firestore.FieldValue.delete(), LastCertRank: firebase.firestore.FieldValue.delete() });
      }
    });
  }

  private setCertNumberToNextAvailable(numberControl: AbstractControl, code: string | null): void {
    if (!code) {
      numberControl.setValue(null);
    }
    else {
      if (this.existingCertificateIDDictionary[code]) {
        numberControl.setValue(this.existingCertificateIDDictionary[code] + 1);
      } else {
        numberControl.setValue(1);
      }
    }
  }

  resetCertNumber(codeControl: AbstractControl, numberControl: AbstractControl): void {
    const code = codeControl.value;
    if (!code) {
      numberControl.setErrors({ nocode: { value: null } });
      return;
    }
    this.setCertNumberToNextAvailable(numberControl, code);
  }

  async addCertificate(certNgForm: FormGroupDirective): Promise<void> {
    if (this.certificateForm.invalid || this.memberForm.invalid) {
      return;
    }
    await this.afs.doc('members/' + this.data.Id).collection('certificates').add({
      Code: this.certificateForm.controls.Code.value,
      Date: moment(this.certificateForm.controls.Date.value).toDate(),
      Number: this.certificateForm.controls.Code.value ? this.certificateForm.controls.Number.value : null,
      Rank: this.certificateForm.controls.Rank.value
    });
    this.setupCertificateObservable();
    this.clearCertificateForm(certNgForm);
  }

  async deleteCertificate(cert: Certificate): Promise<void> {
    const path = `/members/${this.data.Id}/certificates/${cert.Id}`;
    await this.afs.doc(path).delete();

    this.lastDeletedCertificate = cert;

    const certDeleteSnackBarRef = this.snackBar.open('Certificate deleted', 'Undo', {
      duration: 5000,
    });

    certDeleteSnackBarRef.onAction().subscribe(async () => {
      // undo the delete by readding
      await this.afs.doc('members/' + this.data.Id).collection('certificates').add({
        Code: this.lastDeletedCertificate?.Code,
        Date: this.lastDeletedCertificate?.Date,
        Number: this.lastDeletedCertificate?.Number,
        Rank: this.lastDeletedCertificate?.Rank
      });
      this.lastDeletedCertificate = null;
    });
  }

  clearCertificateForm(certNgForm: FormGroupDirective): void {
    certNgForm.resetForm();
  }

  editCertificate(certificate: CertificateExtra): void {
    this.currentEditingCertificate = certificate;
    this.certificateIDsForFilter.next(this.existingCertificateIDs.getValue().filter(x => !(x.Code === certificate.Code && x.Number === certificate.Number)));
    this.inlineCertificateForm.setValue({ Code: certificate.Code, Date: certificate.Date.toDate(), Number: certificate.Number, Rank: certificate.Rank });
  }

  async saveCertificate(certificate: CertificateExtra): Promise<void> {
    if (this.inlineCertificateForm.invalid) {
      return;
    }

    this.currentEditingCertificate = null;
    await this.afs.doc('members/' + this.data.Id + '/certificates/' + certificate.Id).update({
      Code: this.inlineCertificateForm.controls.Code.value,
      Date: moment(this.inlineCertificateForm.controls.Date.value).toDate(),
      Number: this.inlineCertificateForm.controls.Code.value ? this.inlineCertificateForm.controls.Number.value : null,
      Rank: this.inlineCertificateForm.controls.Rank.value
    });
    this.setupCertificateObservable();

  }

  async deleteMember(): Promise<void> {

    const certificates = await this.afs.collection<Certificate>('members/' + this.data.Id + '/certificates').ref.get();
    const batch = this.afs.firestore.batch();
    // looping through docs in the collection to delete docs as a bulk operation
    certificates.forEach(doc => {
      batch.delete(doc.ref);
    });
    const memberRef = this.afs.doc<Member>('members/' + this.data.Id).ref;
    const memberData = (await memberRef.get()).data();
    // finally commit
    batch.delete(memberRef);
    this.lastDeletedMemberAndCertificates = { Member: memberData, Certificates: certificates.docs.map(cert => cert.data()) };
    if (this.certificatesChangeSubscription) {
      this.certificatesChangeSubscription.unsubscribe();
    }
    await batch.commit();

    const memberDeleteSnackBarRef = this.snackBar.open('Member deleted', 'Undo', {
      duration: 5000,
    });

    memberDeleteSnackBarRef.onAction().subscribe(async () => {
      const undoBatch = this.afs.firestore.batch();
      // undo the delete by readding
      const newMemberRef = this.afs.collection('members').doc().ref;
      undoBatch.set(newMemberRef, {
        Name: this.lastDeletedMemberAndCertificates?.Member?.Name,
        IdentificationID: this.lastDeletedMemberAndCertificates?.Member?.IdentificationID,
        City: this.lastDeletedMemberAndCertificates?.Member?.City,
        Country: this.lastDeletedMemberAndCertificates?.Member?.Country,
        Dojo: this.lastDeletedMemberAndCertificates?.Member?.Dojo,
        LastCertRank: this.lastDeletedMemberAndCertificates?.Member?.LastCertRank ?? null,
        LastCertDate: this.lastDeletedMemberAndCertificates?.Member?.LastCertDate ?? null,
      });

      this.lastDeletedMemberAndCertificates?.Certificates.forEach(async cert => {
        const newCertRef = newMemberRef.collection('certificates').doc();
        undoBatch.set(newCertRef, {
          Code: cert?.Code,
          Date: cert?.Date,
          Number: cert?.Number,
          Rank: cert?.Rank
        });
      });

      await undoBatch.commit();
      this.lastDeletedMemberAndCertificates = null;
    });
  }

  private pad(num: number, size: number): string {
    let s = num + '';
    while (s.length < size) { s = '0' + s; }
    return s;
  }
}

export function forbiddenCertNumberValidator(existingCerts: { Code: string, Number: number }[]): ValidatorFn {
  return (group: AbstractControl) => {

    const formGroup = group as FormGroup;
    const numberMissing = !!formGroup.controls['Code'].value && !!!formGroup.controls['Number'].value;
    const dupeFound = !!formGroup.controls['Code'].value && existingCerts.findIndex(x => x.Code === formGroup.controls['Code'].value && x.Number === formGroup.controls['Number'].value) > -1;
    const val = { value: formGroup.controls['Number'].value };
    const error = numberMissing ? { required: val } : dupeFound ? { dupe: val } : null;
    formGroup.controls['Number'].setErrors(error);
    return error;
  };
}
