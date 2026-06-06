export default {
  name: 'staffMember',
  title: 'Staff Member',
  type: 'document',
  fields: [
    {name: 'name', title: 'Name', type: 'string'},
    {name: 'role', title: 'Role', type: 'string'},
    {
      name: 'department',
      title: 'Department',
      type: 'string',
      options: {
        list: [
          'kitchen',
          'bar',
          'housekeeping',
          'reception',
          'maintenance',
          'purchasing',
          'driver'
        ]
      }
    },
    {name: 'phone', title: 'Phone', type: 'string'},
    {name: 'email', title: 'Email', type: 'string'},
    {name: 'notes', title: 'Notes', type: 'text'}
  ]
}
