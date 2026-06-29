export default {
  name: 'lcbrBooking',
  title: 'LCBR Booking',
  type: 'document',
  fields: [
    {name: 'bookingNo', title: 'Booking No', type: 'string'},
    {name: 'externalNo', title: 'External No', type: 'string'},
    {name: 'guestName', title: 'Guest Name', type: 'string'},
    {name: 'checkIn', title: 'Check-in', type: 'date'},
    {name: 'checkOut', title: 'Check-out', type: 'date'},
    {name: 'nights', title: 'Nights', type: 'number'},
    {name: 'roomCount', title: 'Room Count', type: 'number'},
    {name: 'roomTypes', title: 'Room Types', type: 'array', of: [{type: 'string'}]},
    {name: 'totalAmount', title: 'Total Amount', type: 'number'},
    {name: 'prepaidAmount', title: 'Prepaid Amount', type: 'number'},
    {name: 'paymentMethod', title: 'Payment Method', type: 'string'},
    {name: 'source', title: 'Source', type: 'string'},
    {name: 'ratePlan', title: 'Rate Plan', type: 'string'},
    {name: 'extraServices', title: 'Extra Services', type: 'string'},
    {name: 'guestComment', title: 'Guest Comment', type: 'string'},
    {name: 'phone', title: 'Phone', type: 'string'},
    {name: 'email', title: 'Email', type: 'string'},
    {name: 'country', title: 'Country', type: 'string'},
    {name: 'guestCount', title: 'Guest Count', type: 'number'},
    {name: 'isGroup', title: 'Is Group', type: 'boolean'},
    {
      name: 'groupRef',
      title: 'Group Portal',
      type: 'reference',
      to: [{type: 'groupPortal'}],
      weak: true
    },
    {name: 'bookedAt', title: 'Booked At', type: 'datetime'}
  ]
}
