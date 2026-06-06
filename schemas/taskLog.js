const departmentOptions = [
  {title: 'Kitchen', value: 'kitchen'},
  {title: 'Bar', value: 'bar'},
  {title: 'Housekeeping', value: 'housekeeping'},
  {title: 'Reception', value: 'reception'},
  {title: 'Maintenance', value: 'maintenance'},
  {title: 'Purchasing', value: 'purchasing'},
  {title: 'Driver', value: 'driver'}
]

const statusOptions = [
  {title: 'Pending', value: 'pending'},
  {title: 'In progress', value: 'in_progress'},
  {title: 'Done', value: 'done'},
  {title: 'Overdue', value: 'overdue'}
]

export default {
  name: 'taskLog',
  title: 'Task Log',
  type: 'document',

  fields: [
    {
      name: 'taskTitle',
      title: 'Task title',
      type: 'string',
      validation: (Rule) => Rule.required()
    },
    {
      name: 'assignedTo',
      title: 'Assigned to',
      type: 'string',
      description: 'Staff member name'
    },
    {
      name: 'department',
      title: 'Department',
      type: 'string',
      options: {list: departmentOptions}
    },
    {
      name: 'createdAt',
      title: 'Created at',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString()
    },
    {
      name: 'completedAt',
      title: 'Completed at',
      type: 'datetime'
    },
    {
      name: 'durationMinutes',
      title: 'Duration (minutes)',
      type: 'number',
      description: 'Auto or manual entry'
    },
    {
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: statusOptions},
      initialValue: 'pending'
    },
    {
      name: 'linkedGroup',
      title: 'Linked group',
      type: 'reference',
      to: [{type: 'groupPortal'}, {type: 'groupStay'}],
      description: 'Portal or group stay, if applicable'
    },
    {
      name: 'notes',
      title: 'Notes',
      type: 'text'
    }
  ],

  preview: {
    select: {
      taskTitle: 'taskTitle',
      assignedTo: 'assignedTo',
      status: 'status',
      createdAt: 'createdAt'
    },
    prepare({taskTitle, assignedTo, status, createdAt}) {
      const subtitle = [assignedTo, status, createdAt?.slice(0, 10)].filter(Boolean).join(' · ')
      return {
        title: taskTitle || 'Task',
        subtitle
      }
    }
  }
}
