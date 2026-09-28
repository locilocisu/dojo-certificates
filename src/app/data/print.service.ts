import { Injectable } from '@angular/core';
import { MemberWithCertificates } from './member';
import jsPDF from 'jspdf';
import autoTable, { RowInput, Styles } from 'jspdf-autotable';
import moment from 'moment';
import { Ranks } from './ranks';

@Injectable({
  providedIn: 'root'
})
export class PrintService {

  constructor() { }

  public print(members: MemberWithCertificates[]): void {
    const doc = new jsPDF({ orientation: 'landscape' });

    const bodyContent: RowInput[] = [];
    const mainRowStyle: Partial<Styles> = { cellPadding: { left: 1, top: 5, bottom: 2.5 }, fontSize: 12 };
    members.forEach(m => {
      bodyContent.push([
        { content: m.Name, styles: {fontStyle: 'bold', ...mainRowStyle }},
        { content: m.IdentificationID, styles: mainRowStyle },
        { content: m.Country, styles: mainRowStyle },
        { content: m.City, styles: mainRowStyle },
        { content: m.Dojo, styles: mainRowStyle }
      ]);
      bodyContent.push([{ colSpan: 5, content: 'Certificates', styles: { lineWidth: { top: 1 }, cellPadding: { top: 2, left: 1, bottom: 0 }, fillColor: [201, 201, 201] } }]);
      const sortedCerts = m.certificates.sort((a, b) => a.Date.toMillis() - b.Date.toMillis());
      sortedCerts.forEach((c, index) => {
        let style: Partial<Styles> = {};
        if (index === m.certificates.length - 1) {
          style = { lineWidth: { bottom: 0.5 }, lineColor: 'black' };
        }
        bodyContent.push([
          { content: Ranks[c.Rank], styles: style },
          { content: moment(c.Date.toDate()).format('MMM D YYYY'), styles: style },
          { content: c.Code + '-' + this.pad(c.Number, 3), styles: style, colSpan: 3 }]);
      });
    });

    autoTable(doc, {
      head: [['Name', 'Member ID', 'Country', 'City', 'Dojo']],
      body: bodyContent,
      theme: 'plain',
      headStyles: { fontStyle: 'bold', textColor: 'white', fillColor: [255, 0, 0] }
    });
    this.addWatermark(doc);
    doc.save('shougenkai-members-' + moment().format('yyyyMMDD-hhmm') + '.pdf');
  }

  private addWatermark(doc: jsPDF): void {
    const totalPages = doc.getNumberOfPages();
    const img = new Image();
    img.src = 'assets/SKSK.png';
    img.style.opacity = '0.5';
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.addImage(img, 'PNG', doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 25, 20, 20);
    }
  }

  private pad(num: number, size: number): string {
    let s = num + '';
    while (s.length < size) { s = '0' + s; }
    return s;
  }
}
