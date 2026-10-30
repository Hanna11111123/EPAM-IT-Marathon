import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';

import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';
import { GroupSnapshot } from '@app/models/group-orders/group-snapshot.model';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';

@Injectable({ providedIn: 'root' })
export class GroupOrdersService {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly quiet = new HttpContext().set(SKIP_ERROR_TOAST, true);
  private readonly inviteService = inject(GuestInviteService);

  /** reservationId -> groupReservationId (via invite token). */
  resolveGroupId$(reservationId: string): Observable<string> {
    return this.inviteService.getInviteToken$(reservationId, this.quiet).pipe(
      switchMap(({ token }) => this.inviteService.getInvite$(token, this.quiet)),
      map((invite) => invite.GroupReservationId),
    );
  }

  getSnapshot$(groupId: string): Observable<GroupSnapshot> {
    return this.http.get<GroupSnapshot>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupId)}/sessions`,
      { context: this.quiet },
    );
  }

  removeGuest$(groupId: string, guestSessionId: string): Observable<GroupSnapshot> {
    return this.http.delete<GroupSnapshot>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(guestSessionId)}`,
    );
  }

  submitGroup$(groupId: string, reservationId: string) {
    return this.http.post<{ dishId: string; quantity: number }[]>(
      `${this.baseUrl}/group-reservations/${encodeURIComponent(groupId)}/submit`,
      { reservationId },
    );
  }
}
