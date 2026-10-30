using System.ComponentModel.DataAnnotations;

namespace APIHandler.Models.GroupReservation;

public record SubmitGroupReservationRequest([property: Required] string ReservationId);
