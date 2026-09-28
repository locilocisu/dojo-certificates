import { Timestamp } from '@firebase/firestore-types';

export interface Certificate {
    Id: string;
    Code: string;
    Number: number;
    Date: Timestamp;
    Rank: string;
}
