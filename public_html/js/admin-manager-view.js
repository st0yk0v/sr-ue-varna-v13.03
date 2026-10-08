// Admin Manager View component
var AdminManagerView = function(props) {
  var isAdmin = props.isAdmin;
  var _r = React.useState(null), admins = _r[0], setAdmins = _r[1];
  var _r2 = React.useState(''), newEmail = _r2[0], setNewEmail = _r2[1];
  var _r3 = React.useState('admin'), newRole = _r3[0], setNewRole = _r3[1];
  var _r4 = React.useState(null), error = _r4[0], setError = _r4[1];
  var _r5 = React.useState(false), busy = _r5[0], setBusy = _r5[1];

  var load = function() {
    api('listadmins', {}).then(function(r) {
      if (r.success) setAdmins(r.admins);
      else setError(r.error);
    }).catch(function(e) { setError(String(e)); });
  };

  React.useEffect(load, []);

  var submit = function(ev) {
    ev.preventDefault();
    setBusy(true);
    api('addadmin', {email: newEmail, adminRole: newRole}).then(function(r) {
      setBusy(false);
      if (r.success) { setNewEmail(''); load(); }
      else setError(r.error);
    }).catch(function(e) { setBusy(false); setError(String(e)); });
  };

  var remove = function(email) {
    if (!confirm('Премахване на ' + email + '?')) return;
    api('removeadmin', {email: email}).then(function(r) {
      if (r.success) load();
      else setError(r.error);
    }).catch(function(e) { setError(String(e)); });
  };

  return e('div', {className: 'card'},
    e('div', {className: 'card-body'},
      error && e('div', {style: {color: 'var(--err)', marginBottom: '.75rem', fontSize: '.82rem'}},
        e('i', {className: 'fas fa-exclamation-circle'}), ' ', error),

      // Add admin form
      e('form', {onSubmit: submit, style: {display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)'}},
        e('input', {type: 'email', placeholder: 'имейл@ue-varna.bg', required: true, value: newEmail, onChange: function(ev) { setNewEmail(ev.target.value); }, style: {flex: '1', minWidth: '200px', padding: '.5rem .75rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: '.88rem'}}),
        e('select', {value: newRole, onChange: function(ev) { setNewRole(ev.target.value); }, style: {padding: '.5rem .75rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: '.88rem', background: 'var(--surface)'}},
          e('option', {value: 'admin'}, 'Администратор'),
          e('option', {value: 'rector'}, 'Ректор'),
          e('option', {value: 'vice_rector'}, 'Зам.-ректор'),
          e('option', {value: 'nidd'}, 'НИД'),
          e('option', {value: 'ckk'}, 'ЦКК'),
          e('option', {value: 'reviewer'}, 'Рецензент'),
          e('option', {value: 'teacher'}, 'Преподавател')
        ),
        e('button', {type: 'submit', className: 'btn btn-success', disabled: busy},
          e('i', {className: 'fas fa-plus'}), ' Добави')
      ),

      // Admin list
      !admins ? e('div', {style: {textAlign: 'center', padding: '1rem'}},
        e('i', {className: 'fas fa-spinner fa-spin'}), ' Зареждане...') :

      !admins.length ? e('div', {className: 'empty-state'},
        e('i', {className: 'fas fa-users'}), e('p', null, 'Няма администратори.')) :

      e('div', {className: 'table-wrap'},
        e('table', {style: {fontSize: '.85rem'}},
          e('thead', null,
            e('tr', null,
              e('th', null, 'Имейл'),
              e('th', null, 'Роля'),
              e('th', {style: {textAlign: 'center'}}, 'Заявки'),
              e('th', {style: {textAlign: 'right'}}, 'Действия')
            )
          ),
          e('tbody', null, admins.map(function(a) {
            return e('tr', {key: a.email},
              e('td', null, a.email),
              e('td', null, e('span', {className: 'badge ' + (a.role === 'admin' ? 'approved' : 'draft')}, a.role)),
              e('td', {style: {textAlign: 'center'}},
                a.hasForms ? e('span', {style: {color: 'var(--warn)', fontWeight: 700, fontSize: '.78rem'}},
                  a.formCount, ' заявки') : e('span', {style: {color: 'var(--ink-5)'}}, '—')
              ),
              e('td', {style: {textAlign: 'right'}},
                e('button', {className: 'btn btn-danger btn-sm', onClick: function() { remove(a.email); }, title: 'Премахни'},
                  e('i', {className: 'fas fa-trash'}))
              )
            );
          }))
        )
      )
    )
  );
};
