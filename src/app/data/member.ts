
import { Timestamp } from '@firebase/firestore-types';
import { Certificate } from './certificate';

export interface Member {
    Id: string;
    Name: string;
    IdentificationID: string;
    Country: string;
    City: string;
    Dojo: string;
    LastCertRank: string | null;
    LastCertDate: Timestamp | null;
}

export interface MemberWithCertificates extends Member {
    certificates: Certificate[];
}