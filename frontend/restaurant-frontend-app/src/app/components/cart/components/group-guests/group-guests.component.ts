import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  GroupParticipant,
  GroupSnapshot,
} from '@app/models/group-orders/group-snapshot.model';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';

@Component({
  selector: 'app-group-guests',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './group-guests.component.html',
  styleUrl: './group-guests.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupGuestsComponent implements OnInit {
  private readonly groupOrders = inject(GroupOrdersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reservationId = input.required<string>();
  readonly groupSubmitted = output<void>();

  readonly groupId = signal<string | null>(null);
  readonly snapshot = signal<GroupSnapshot | null>(null);
  readonly expandedIds = signal<ReadonlySet<string>>(new Set());
  readonly guestToRemove = signal<GroupParticipant | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly owner = computed(() =>
    this.snapshot()?.participants.find((p) => p.type === 'Owner') ?? null,
  );
  readonly guests = computed(() =>
    (this.snapshot()?.participants ?? []).filter((p) => p.type === 'Guest'),
  );
  readonly ordered = computed(() => this.guests().filter((g) => g.isSubmitted));
  readonly waiting = computed(() => this.guests().filter((g) => !g.isSubmitted));
  readonly guestsTotal = computed(() =>
    this.guests().reduce((sum, g) => sum + g.total, 0),
  );
  readonly ownerTotal = computed(() => this.owner()?.total ?? 0);
  readonly grandTotal = computed(() => this.snapshot()?.total ?? 0);
  readonly ownerItemsCount = computed(() =>
    (this.owner()?.items ?? []).reduce((n, i) => n + i.quantity, 0),
  );

  ngOnInit(): void {
    this.groupOrders
      .resolveGroupId$(this.reservationId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (id) => {
          this.groupId.set(id);
          this.reload();
        },
        // No group pre-order for this reservation: render nothing.
        error: () => this.groupId.set(null),
      });
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggle(id: string): void {
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  askRemove(guest: GroupParticipant): void {
    this.guestToRemove.set(guest);
  }

  cancelRemove(): void {
    this.guestToRemove.set(null);
  }

  confirmRemove(): void {
    const guest = this.guestToRemove();
    const groupId = this.groupId();
    if (!guest || !groupId) {
      return;
    }
    this.busy.set(true);
    this.groupOrders
      .removeGuest$(groupId, guest.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.snapshot.set(snapshot);
          this.guestToRemove.set(null);
          this.busy.set(false);
        },
        error: () => {
          this.error.set('Could not remove the guest. Please try again.');
          this.guestToRemove.set(null);
          this.busy.set(false);
        },
      });
  }

  submitGroup(): void {
    const groupId = this.groupId();
    if (!groupId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.groupOrders
      .submitGroup$(groupId, this.reservationId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.groupSubmitted.emit();
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'Could not submit the group pre-order.');
          this.busy.set(false);
        },
      });
  }

  private reload(): void {
    const groupId = this.groupId();
    if (!groupId) {
      return;
    }
    this.groupOrders
      .getSnapshot$(groupId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => this.snapshot.set(snapshot),
        error: () => this.snapshot.set(null),
      });
  }
}
