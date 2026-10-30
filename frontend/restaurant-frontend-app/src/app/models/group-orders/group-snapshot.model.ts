import { DishListResponse } from '../dishes/dish-list-response.model';

export interface GroupParticipantItem {
  dish: DishListResponse;
  quantity: number;
}

export interface GroupParticipant {
  id: string;
  type: 'Owner' | 'Guest';
  name: string;
  items: GroupParticipantItem[];
  total: number;
  isSubmitted: boolean;
}

export interface GroupSnapshot {
  participants: GroupParticipant[];
  total: number;
}
