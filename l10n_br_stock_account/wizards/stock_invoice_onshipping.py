# Copyright (C) 2009  Renato Lima - Akretion
# License AGPL-3 - See http://www.gnu.org/licenses/agpl-3.0.html

from odoo import _, api, fields, models
from odoo.exceptions import UserError


class StockInvoiceOnshipping(models.TransientModel):
    _inherit = "stock.invoice.onshipping"

    def _get_fiscal_operation_journal(self):
        active_ids = self.env.context.get("active_ids", [])
        if active_ids:
            active_ids = active_ids[0]
        pick_obj = self.env["stock.picking"]
        picking = pick_obj.browse(active_ids)
        if not picking or not picking.move_lines:
            # Caso sem dados, apenas para evitar erro
            return False
        if not picking.fiscal_operation_id:
            # Caso de Fatura Internacional, sem os dados Fiscais do Brasil
            return False
        else:
            # Caso Brasileiro
            return True

    @api.onchange("group")
    def onchange_group(self):
        super().onchange_group()
        pickings = self._load_pickings()
        has_fiscal_operation = False
        if pickings.mapped("fiscal_operation_id"):
            has_fiscal_operation = True
        self.has_fiscal_operation = has_fiscal_operation

    has_fiscal_operation = fields.Boolean()

    fiscal_operation_journal = fields.Boolean(
        string="Account Jornal from Fiscal Operation",
        default=_get_fiscal_operation_journal,
    )

    group = fields.Selection(
        selection_add=[("fiscal_operation", "Fiscal Operation")],
        ondelete={"fiscal_operation": "set default"},
    )

    def _get_journal(self):
        """
        Get the journal depending on the journal_type
        :return: account.journal recordset
        """
        self.ensure_one()
        if self.fiscal_operation_journal:
            pickings = self._load_pickings()
            picking = fields.first(pickings)
            journal = picking.fiscal_operation_id.journal_id
            if not journal:
                raise UserError(
                    _(
                        "Invalid Journal! There is not journal defined"
                        " for this company: {} in fiscal operation: {} !"
                    ).format(picking.company_id.name, picking.fiscal_operation_id.name)
                )
        else:
            journal = super()._get_journal()

        return journal

    def _build_invoice_values_from_pickings(self, pickings):
        invoice, values = super()._build_invoice_values_from_pickings(pickings)
        picking = fields.first(pickings)
        if not picking.fiscal_operation_id:
            # Caso de Fatura Internacional, sem os dados Fiscais do Brasil
            return invoice, values

        fiscal_vals = picking._prepare_br_fiscal_dict()

        document_type = picking.company_id.document_type_id
        document_type_id = picking.company_id.document_type_id.id

        fiscal_vals["document_type_id"] = document_type_id

        document_serie = document_type.get_document_serie(
            picking.company_id, picking.fiscal_operation_id
        )
        if document_serie:
            fiscal_vals["document_serie_id"] = document_serie.id

        if picking.fiscal_operation_id and picking.fiscal_operation_id.journal_id:
            fiscal_vals["journal_id"] = picking.fiscal_operation_id.journal_id.id

        # Endereço de Entrega diferente do Endereço de Faturamento
        # so informado quando é diferente
        if fiscal_vals["partner_id"] != values["partner_id"]:
            values["partner_shipping_id"] = fiscal_vals["partner_id"]
        else:
            # Já no modulo stock_picking_invoicing o campo partner_shipping_id
            # é informado mas para evitar ter a NFe com o Endereço de Entrega
            # quando esse é o mesmo Endereço, esta sendo removido.
            # TODO: Deveria ser informado mesmo quando é o mesmo? Isso não
            #  acontecia na v12.
            del values["partner_shipping_id"]

        # Ser for feito o update como abaixo o campo
        # fiscal_operation_id vai vazio
        # fiscal_vals.update(values)
        values.update(fiscal_vals)

        return invoice, values

    def _get_invoice_line_values(self, moves, invoice_values, invoice):
        """
        Create invoice line values from given moves
        :param moves: stock.move
        :param invoice: account.invoice
        :return: dict
        """

        values = super()._get_invoice_line_values(moves, invoice_values, invoice)
        move = fields.first(moves)
        if not move.fiscal_operation_id:
            # Caso Brasileiro se caracteriza pela Operação Fiscal
            return values

        fiscal_values = move._prepare_br_fiscal_dict()

        # A Fatura não pode ser criada com os campos price_unit e fiscal_price
        # negativos, o metodo _prepare_br_fiscal_dict retorna o price_unit
        # negativo, por isso é preciso tira-lo antes do update, e no caso do
        # fiscal_price é feito um update para caso do valor ser diferente do
        # price_unit
        del fiscal_values["price_unit"]
        fiscal_values["fiscal_price"] = abs(fiscal_values.get("fiscal_price"))

        # Como é usada apenas uma move para chamar o _prepare_br_fiscal_dict
        # a quantidade/quantity do dicionario traz a quantidade referente a
        # apenas a essa linha por isso é removido aqui.
        del fiscal_values["quantity"]

        # Mesmo a quantidade estando errada por ser chamada apenas por uma move
        # no caso das stock.move agrupadas e os valores fiscais e de totais
        # retornados poderem estar errados ao criar o documento fiscal isso
        # será recalculado já com a quantidade correta.

        values.update(fiscal_values)

        # Apesar do metodo _get_taxes retornar os Impostos corretamente
        # ao rodar o _simulate_line_onchange
        # https://github.com/OCA/account-invoicing/blob/14.0/
        # stock_picking_invoicing/wizards/stock_invoice_onshipping.py#L415
        # o valor acaba sendo alterado
        # TODO: Analisar se isso é um problema da Localização e se existe
        #  alguma forma de resolver, por enquanto está sendo informado
        #  novamente aqui
        values["tax_ids"] = [(6, 0, move.tax_ids.ids)]

        return values

    def _get_move_key(self, move):
        """
        Get the key based on the given move
        :param move: stock.move recordset
        :return: key
        """
        key = super()._get_move_key(move)
        if move.fiscal_operation_line_id:
            # Linhas de Operações Fiscais diferentes
            # não podem ser agrupadas
            key = key + (move.fiscal_operation_line_id,)

        return key
