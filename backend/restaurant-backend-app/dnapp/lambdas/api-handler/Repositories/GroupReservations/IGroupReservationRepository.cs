using APIHandler.Entities;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace APIHandler.Repositories.GroupReservations;

public interface IGroupReservationRepository
{
    Task<GroupReservation?> GetByReservationIdAsync(string reservationId);
    Task<GroupReservation?> GetGroupReservationByIdAsync(string groupReservationId);
    Task DeleteGroupReservationAsync(GroupReservation groupReservation);
    Task SaveGroupReservationAsync(GroupReservation groupReservation);
    Task<GroupReservation?> GetGroupReservationByTokenAsync(string token);

    /// <summary>Atomically saves the group reservation and its order in a single transaction.</summary>
    Task SubmitAsync(GroupReservation groupReservation, Order order);
}
