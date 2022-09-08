/*
Copyright (C) 2016-Today KMEE (https://kmee.com.br)
@author: Luis Felipe Mileo <mileo@kmee.com.br>
 License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define("l10n_br_pos.models", function (require) {
    "use strict";
    const core = require("web.core");
    const rpc = require("web.rpc");
    const utils = require("web.utils");
    const models = require("point_of_sale.models");
    const util = require("l10n_br_pos.util");
    const {Gui} = require("point_of_sale.Gui");

    const round_pr = utils.round_precision;
    const _t = core._t;

    const partner_company_fields = [
        "legal_name",
        "cnpj_cpf",
        "inscr_est",
        "inscr_mun",
        "suframa",
        "tax_framework",
        "street_number",
        "city_id",
    ];
    models.load_fields("res.partner", partner_company_fields.concat(["ind_ie_dest"]));
    models.load_fields("res.company", partner_company_fields.concat(["tax_framework"]));
    // Models.load_fields("uom.uom", ["code"]); Verificar se o vazio do core pega tudo.
    models.load_fields("product.product", [
        "tax_icms_or_issqn",
        "fiscal_type",
        "icms_origin",
        "fiscal_genre_code",
        "ncm_id",
        // FIXME: Verificar o que houve.
        // "ncm_code",
        // "ncm_code_exception",
        "nbm_id",
        "fiscal_genre_id",
        "service_type_id",
        "city_taxation_code_id",
        "ipi_guideline_class_id",
        "ipi_control_seal_id",
        "nbs_id",
        "cest_id",
    ]);

    models.load_models({
        model: "l10n_br_pos.product_fiscal_map",
        fields: [
            // TODO: Load only required fields
            // 'product_tmpl_id',
            // 'icms_cst_code',
            // 'icms_percent',
            // 'icms_effective_percent',
            // 'pis_cst_code',
            // 'pis_base',
            // 'pis_percent',
            // 'cofins_cst_code',
            // 'cofins_base',
            // 'cofins_percent',
            // 'cfop',
            // 'additional_data',
            // 'amount_estimate_tax',
        ],
        domain: function (self) {
            return [
                ["pos_config_id", "=", self.config.id],
                ["company_id", "=", (self.company && self.company.id) || false],
            ];
        },
        loaded: function (self, lines) {
            self.fiscal_map = lines;
            self.fiscal_map_by_template_id = {};
            lines.forEach(function (line) {
                self.fiscal_map_by_template_id[line.product_tmpl_id[0]] = line;
            });
        },
    });

    var _super_order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            // CORE METHODS
            _super_order.initialize.apply(this, arguments, options);
            this.init_locked = true;

            var company = this.pos.company;
            // Company details
            this.document_company = {};
            this.document_company.cnpj = company.cnpj || null;
            this.document_company.ie = company.ie || null;
            this.document_company.tax_framework = company.tax_framework || null;

            if (!options.json) {
                // Company Details

                // L10n_br_fiscal.document.electronic fields
                //      Informações da transmissão do documento fiscal

                this.status_code = this.status_code || null;
                this.status_name = this.status_name || null;
                this.status_description = this.status_description || null;

                this.authorization_date = this.authorization_date || null;
                this.authorization_protocol = this.authorization_protocol || null;
                this.authorization_file = this.authorization_file || null;

                this.cancel_date = this.cancel_date || null;
                this.cancel_protocol_number = this.cancel_protocol_number || null;
                this.cancel_file = this.cancel_file || null;

                this.is_edoc_printed = this.is_edoc_printed || null;

                // L10n_br_fiscal.document fields

                this.document_state = this.document_state || "Em Digitação";
                this.document_number = this.document_number || null;
                this.document_serie = this.document_serie || null;
                this.document_session_number = this.document_session_number || null;
                this.document_rps_number = this.document_rps_number || null;

                this.document_key = this.document_key || null;
                this.document_date = this.document_date || null;
                this.document_electronic = this.document_electronic || null;

                // NFC-e & CF-e fields

                this.document_qrcode_signature = this.document_qrcode_signature || null;
                this.document_qrcode_url = this.document_qrcode_url || null;

                // Other POS Fields

                this.cnpj_cpf = this.cnpj_cpf || null;

                this.fiscal_operation_id =
                    this.pos.config.out_pos_fiscal_operation_id[0] || null;
                this.document_type_id =
                    this.pos.config.simplified_document_type_id[0] || null;
                this.document_type = this.pos.config.simplified_document_type || null;
            }

            // Campo em que são armazenados as mensagens do processo de comunicação.
            this.document_event_messages = this.document_event_messages || [];

            this.init_locked = false;
            this.save_to_db();
        },
        init_from_JSON: function (json) {
            _super_order.init_from_JSON.apply(this, arguments);

            // L10n_br_fiscal.document.electronic fields
            //      Informações da transmissão do documento fiscal

            this.status_code = json.status_code;
            this.status_name = json.status_name;
            this.status_description = json.status_description;

            this.authorization_date = json.authorization_date;
            this.authorization_protocol = json.authorization_protocol;
            this.authorization_file = json.authorization_file;

            this.cancel_date = json.cancel_date;
            this.cancel_protocol_number = json.cancel_protocol_number;
            this.cancel_file = json.cancel_file;

            this.is_edoc_printed = json.is_edoc_printed;

            // L10n_br_fiscal.document fields

            this.document_state = json.document_state;
            this.document_number = json.document_number;
            this.document_serie = json.document_serie;
            this.document_session_number = json.document_session_number;
            this.document_rps_number = json.document_rps_number;

            this.document_key = json.document_key;
            this.document_date = json.document_date;
            this.document_electronic = json.document_electronic;

            // NFC-e & CF-e fields

            this.document_qrcode_signature = json.document_qrcode_signature;
            this.document_qrcode_url = json.document_qrcode_url;

            // Other POS Fields

            this.cnpj_cpf = json.cnpj_cpf;

            // Campo em que são armazenados as mensagens do processo de comunicação.

            this.fiscal_operation_id = json.fiscal_operation_id;
            this.document_type_id = json.document_type_id;
            this.document_type = json.document_type;
        },
        _prepare_fiscal_json: function (json) {
            // Company details
            json.company = this.document_company || {};

            // Dados do documento
            json.status_code = this.status_code;
            json.status_name = this.status_name;
            json.status_description = this.status_description;

            json.authorization_date = this.authorization_date;
            json.authorization_protocol = this.authorization_protocol;
            json.authorization_file = this.authorization_file;

            json.cancel_date = this.cancel_date;
            json.cancel_protocol_number = this.cancel_protocol_number;
            json.cancel_file = this.cancel_file;

            json.is_edoc_printed = this.is_edoc_printed;

            // L10n_br_fiscal.document fields

            json.document_state = this.document_state;
            json.document_number = this.document_number;
            json.document_serie = this.document_serie;
            json.document_session_number = this.document_session_number;
            json.document_rps_number = this.document_rps_number;

            json.document_key = this.document_key;
            json.document_date = this.document_date;
            json.document_electronic = this.document_electronic;

            // NFC-e & CF-e fields

            json.document_qrcode_signature = this.document_qrcode_signature;
            json.document_qrcode_url = this.document_qrcode_url;

            // Campo em que são armazenados as mensagens do processo de comunicação.
            json.document_event_messages = this.document_event_messages || [];

            json.fiscal_operation_id = this.pos.config.out_pos_fiscal_operation_id[0];
            json.document_type_id = this.pos.config.simplified_document_type_id[0];
            json.document_type = this.pos.config.simplified_document_type;

            // Dados do cliente
            // json.client = this.cnpj_cpf;
            json.cnpj_cpf = this.get_cnpj_cpf();

            // Dados adicionais do documento
            if (this.pos.config.additional_data) {
                var taxes = this.get_taxes_and_percentages(json);
                json.additional_data = this.compute_message(
                    this.pos.config.additional_data,
                    taxes
                );
            } else {
                json.additional_data = null;
            }
        },
        export_as_JSON: function () {
            // TODO: O método export_as_JSON só deve ter os dados
            // necessários para a emissão do cumpom fiscal
            var json = _super_order.export_as_JSON.call(this);
            // Remove lines without price
            json.orderlines = _.filter(json.orderlines, function (line) {
                return line.price !== 0;
            });
            this._prepare_fiscal_json(json);
            return json;
        },
        export_for_printing: function () {
            // TODO: O método export_for_printing só deve ter os dados para impressão
            var json = _super_order.export_for_printing.apply(this, arguments);
            // Remove lines without price
            json.orderlines = _.filter(json.orderlines, function (line) {
                return line.price !== 0;
            });
            this._prepare_fiscal_json(json);
            return json;
        },
        clone: function () {
            var order = _super_order.clone.call(this);
            order.cnpj_cpf = null;
            return order;
        },
        // FISCAL METHODS
        set_cnpj_cpf: function (cnpj_cpf) {
            if (util.validate_cnpj_cpf(cnpj_cpf)) {
                this.assert_editable();
                this.cnpj_cpf = cnpj_cpf;
                this.trigger("change", this);
                return true;
            }
            this.pos.gui.show_popup("alert", {
                title: _t("Invalid CNPJ / CPF !"),
                body: _t("Enter a valid CNPJ / CPF number"),
            });
            return false;
        },
        get_cnpj_cpf: function () {
            var partner_vat = null;
            if (this.get_client() && this.get_client().vat) {
                partner_vat = this.get_client().vat;
            }
            return this.cnpj_cpf || partner_vat;
        },
        get_taxes_and_percentages: function (order) {
            var taxes = {
                federal: {
                    percent: 0,
                    total: 0,
                },
                estadual: {
                    percent: 0,
                    total: 0,
                },
            };
            const rounding = this.pos.currency.rounding;
            var line = order.orderlines[0];
            taxes.federal.percent = line.cofins_percent + line.pis_percent;
            taxes.federal.total = round_pr(
                order.total_paid * (taxes.federal.percent / 100),
                rounding
            );
            taxes.estadual.percent = line.icms_percent;
            taxes.estadual.total = round_pr(
                order.total_paid * (taxes.estadual.percent / 100),
                rounding
            );

            return taxes;
        },
        compute_message: function (templateString, taxes) {
            /* Compute fiscal message */
            return new Function(`return \`${templateString}\`;`).call(this, taxes);
        },
        _document_status_popup: function () {
            var msgs = [];
            this.document_event_messages.forEach((element) => {
                msgs.push({
                    id: element.id,
                    label: element.label,
                    item: element.id,
                });
            });
            const result = Gui.showPopup("SelectionPopup", {
                title: _t("Status documento fiscal"),
                list: this.document_event_messages,
                confirmText: "Confirm",
                cancelText: "Cancel",
            });
        },
        document_send: async function () {
            this.document_event_messages.push({
                id: 1000,
                label: "Iniciando Processo de Transmissão",
            });
            this._document_status_popup();
            var result = false;
            var processor_result = null;
            // Verifica se os campos do documento fiscal são válidos
            result = await this._document_validate();
            if (result) {
                // Obtem o responsável pelo envio do documento fiscal;
                var processor = await this._document_get_processor();
                if (processor) {
                    // Efetivamente envia o documento fiscal
                    processor_result = await processor.send_order(this);
                    // Valida se foi emitido corretamente e salva os dados do resulto
                    result = await this._document_check_result(processor_result);
                }
            }
            return result;
        },
        _document_validate: async function () {
            this.document_event_messages.push({
                id: 1002,
                label: "Validando documento fiscal",
            });
            this._document_status_popup();

            //     // if (order.is_to_invoice()) {
            //     //     res |= this.order_nfe_nfse_is_valid(order);
            //     // } else if (order.document_type == DOCUMENTO_CFE) {
            //     //     console.log("order_sat_is_valid")
            //     //     res |= await this.order_sat_is_valid(order);
            //     //     console.log("order_sat_is_valid end")
            //     // } else if (order.document_type == DOCUMENTO_NFCE) {
            //     //     res |= this.order_nfce_is_valid(order);
            //     // }

            return true;
        },
        _document_get_processor: async function () {
            this.document_event_messages.push({
                id: 1003,
                label: "Sem processador localizado",
            });
            this._document_status_popup();
            return null;
        },
        _document_check_result: async function (processor_result) {
            this.document_event_messages.push({
                id: 1004,
                label: "Validando retorno do envio",
            });
            this._document_status_popup();
            this.document_state = "Autorizado";
        },

        //
        // Cancel Workflow
        //
        _document_cancel_validate: async function () {
            this.document_event_messages.push({
                id: 2002,
                label: "Validando cancelamento do documento",
            });
            this._document_status_popup();
            return true;
        },
        _document_cancel_check_result: async function (processor_result) {
            this.document_event_messages.push({
                id: 1004,
                label: "Validando retorno do envio",
            });
            this._document_status_popup();
            this.document_state = "Cancelado";
        },
        document_cancel: async function (cancel_reason) {
            this.document_event_messages.push({
                id: 2001,
                label: "Cancelando o documento fiscal",
            });
            this._document_status_popup();
            var result = false;
            var processor_result = null;
            result = await this._document_cancel_validate();
            if (result) {
                // Obtem o responsável pelo envio do documento fiscal;
                var processor = await this._document_get_processor();
                if (processor) {
                    // Efetivamente cancela o documento fiscal
                    processor_result = await processor.cancel_order(this);
                    // Valida se foi emitido corretamente e salva os dados do resulto
                    result = await this._document_cancel_check_result(processor_result);
                }
            }
            return result;
        },
        add_product: function (product, options) {
            //            Const product_fiscal_map = this.pos.fiscal_map_by_template_id[
            //                product.product_tmpl_id
            //            ];
            //            If (!product_fiscal_map) {
            //                this.pos.gui.show_popup("alert", {
            //                    title: _t("Tax Details"),
            //                    body: _t(
            //                        "There was a problem mapping the item tax. Please contact support."
            //                    ),
            //                });
            //            } else if (!product_fiscal_map.fiscal_operation_line_id) {
            //                this.pos.gui.show_popup("alert", {
            //                    title: _t("Fiscal Operation Line"),
            //                    body: _t(
            //                        "The fiscal operation line is not defined for this product. Please contact support."
            //                    ),
            //                });
            //            } else {
            //            }
            return _super_order.add_product.apply(this, arguments);
        },
    });

    var _super_order_line = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        _prepare_fiscal_json: function (json) {
            var self = this;
            var product = this.get_product();
            var product_fiscal_map =
                self.pos.fiscal_map_by_template_id[product.product_tmpl_id];

            json.cest_id = product.cest_id;
            json.city_taxation_code_id = product.city_taxation_code_id;
            json.fiscal_genre_code = product.fiscal_genre_code;
            json.fiscal_genre_id = product.fiscal_genre_id;
            json.fiscal_type = product.fiscal_type;
            json.icms_origin = product.icms_origin;
            json.ipi_control_seal_id = product.ipi_control_seal_id;
            json.ipi_guideline_class_id = product.ipi_guideline_class_id;
            json.nbs_id = product.nbs_id;
            json.product_default_code = product.default_code;
            json.product_ean = product.barcode;
            json.service_type_id = product.service_type_id;
            json.tax_icms_or_issqn = product.tax_icms_or_issqn;
            json.unit_code = this.get_unit().code;

            if (product_fiscal_map) {
                json.additional_data = product_fiscal_map.additional_data || "";
                json.amount_estimate_tax = product_fiscal_map.amount_estimate_tax || 0;
                json.cfop = product_fiscal_map.cfop_code;
                json.cofins_base = product_fiscal_map.cofins_base;
                json.cofins_cst_code = product_fiscal_map.cofins_cst_code;
                json.cofins_percent = product_fiscal_map.cofins_percent;
                json.company_tax_framework = product_fiscal_map.company_tax_framework;
                json.icms_cst_code = product_fiscal_map.icms_cst_code;
                json.icms_effective_percent = product_fiscal_map.icms_effective_percent;
                json.icms_percent = product_fiscal_map.icms_percent;
                json.icmssn_percent = product_fiscal_map.icmssn_percent;
                json.ncm =
                    product_fiscal_map.ncm_code === "00000000"
                        ? "99999999"
                        : product_fiscal_map.ncm_code;
                json.ncm_code_exception = product_fiscal_map.ncm_code_exception;
                json.pis_base = product_fiscal_map.pis_base;
                json.pis_cst_code = product_fiscal_map.pis_cst_code;
                json.pis_percent = product_fiscal_map.pis_percent;
            }
        },
        // Export_as_JSON: function () {
        //     var json = _super_order_line.export_as_JSON.apply(this, arguments);
        //     this._prepare_fiscal_json(json);
        //     return json;
        // },
        export_for_printing: function () {
            var json = _super_order_line.export_for_printing.apply(this, arguments);
            this._prepare_fiscal_json(json);
            return json;
        },
    });

    var _super_payment_line = models.Paymentline.prototype;
    models.Paymentline = models.Paymentline.extend({
        _prepare_fiscal_json: function (json) {
            console.log("Verificar dados necessários da payment line");
        },
        // Export_as_JSON: function () {
        //     var json = _super_payment_line.export_as_JSON.apply(this, arguments);
        //     this._prepare_fiscal_json(json);
        //     return json;
        // },
        export_for_printing: function () {
            var json = _super_payment_line.export_for_printing.apply(this, arguments);
            this._prepare_fiscal_json(json);
            return json;
        },
    });

    var _super_posmodel = models.PosModel.prototype;

    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            this.cnpj_cpf = null;

            this.last_document_session_number = null;

            return _super_posmodel.initialize.call(this, session, attributes);
        },
        get_cnpj_cpf: function () {
            var order = this.get_order();
            if (order) {
                return order.get_cnpj_cpf();
            }
            return null;
        },
    });
});
