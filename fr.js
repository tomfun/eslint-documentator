jQuery(function ($) {
  $('[data-toggle]').tooltip();
  $.fancybox.defaults.width = 1280;
  $.fancybox.defaults.height = 1200;
  $.fancybox.defaults.autoSize = true;
  $.fancybox.defaults.autoResize = true;
  $.fancybox.defaults.fitToView = true;
  $('.rule-name').fancybox();

  var form = $('.lint-form');
  var configCounter = form.find('div.userConfigRow').size();

  function deleteConfigFromForm(e) {
    $(this).parent().remove();
  }
  function validateConfig(e) {
    var it = $(this);
    var formGroup = it.parents('.form-group');
    try {
      JSON.parse(it.val());
      formGroup.removeClass('has-error').addClass('has-success');
    } catch (e) {
      formGroup.addClass('has-error');
      alert(e);
    }
  }

  form.find('div.userConfigRow textarea').change(validateConfig)

  $('.lint-form .glyphicon-minus').parent().click(deleteConfigFromForm);

  $('.lint-form .add-config').click(function (e) {
    e.preventDefault();
    var newConfig = $('<div class="userConfigRow form-group">' +
      '<label for="userConfig' + configCounter + '">Config json</label>' +
      '<button type="button" class="btn btn-default btn-xs">' +
      '<span class="glyphicon glyphicon-minus"></span>' +
      'Убрать' +
      '</button>' +
      '<textarea class="form-control" rows="4" id="userConfig' + configCounter + '" name="userConfig[]"></textarea>' +
      '</div>'
    );
    configCounter++;
    form.prepend(newConfig);
    newConfig.find('textarea').change(validateConfig);
    newConfig.find('.glyphicon-minus').parent().click(deleteConfigFromForm);
  });
  var highlighted = $('<tr class="my-highlihter"><td>[ ]</td></tr>');
  $('.source-table > tbody').append(highlighted);
  var highlighterWidth = highlighted.width();
  var highlighterHeight = highlighted.height();
  $('[data-source-column]').hover(function() {
    var it = $(this);
    var val = it.data('source-column');
    var span = it.parents('tr').find('>td:first > span');
    var text = span.text();
    var width = span.width();
    var height = span.height();
    var length = text.length;
    highlighted.css({
      left: val * width / length - highlighterWidth / 2 - 3,
      top: span.offset().top - it.parents('table.source-table').offset().top - highlighterHeight / 2 + height / 2
    });
  })
});
