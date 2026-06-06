const roleOptions = [
  {title: 'Kitchen', value: 'kitchen'},
  {title: 'Bar', value: 'bar'},
  {title: 'Housekeeping', value: 'housekeeping'},
  {title: 'Reception', value: 'reception'},
  {title: 'Maintenance', value: 'maintenance'},
  {title: 'Purchasing', value: 'purchasing'},
  {title: 'Driver', value: 'driver'}
]

export default {
  name: 'staffShift',
  title: 'Staff Shift',
  type: 'document',

  fields: [
    {
      name: 'staffMember',
      title: 'Staff member',
      type: 'string',
      validation: (Rule) => Rule.required()
    },
    {
      name: 'role',
      title: 'Role',
      type: 'string',
      options: {list: roleOptions}
    },
    {
      name: 'date',
      title: 'Date',
      type: 'date',
      validation: (Rule) => Rule.required()
    },
    {
      name: 'shiftStart',
      title: 'Shift start',
      type: 'string',
      description: 'Time, e.g. "08:00"'
    },
    {
      name: 'shiftEnd',
      title: 'Shift end',
      type: 'string',
      description: 'Time, e.g. "17:00"'
    },
    {
      name: 'hoursWorked',
      title: 'Hours worked',
      type: 'number',
      description: 'Calculated or entered manually'
    },
    {
      name: 'isRestDay',
      title: 'Rest day',
      type: 'boolean',
      description: 'True if this is a day off',
      initialValue: false
    },
    {
      name: 'notes',
      title: 'Notes',
      type: 'text'
    }
  ],

  preview: {
    select: {
      staffMember: 'staffMember',
      role: 'role',
      date: 'date',
      isRestDay: 'isRestDay'
    },
    prepare({staffMember, role, date, isRestDay}) {
      const subtitle = [role, date, isRestDay ? 'Day off' : null].filter(Boolean).join(' · ')
      return {
        title: staffMember || 'Staff shift',
        subtitle
      }
    }
  }
}
